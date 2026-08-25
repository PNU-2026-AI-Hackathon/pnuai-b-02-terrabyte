package com.terrabyte.backend.mqtt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Callback threading and the acknowledgement policy, without a broker. */
class MqttUplinkRouterTests {

    private static final MqttProperties PROPERTIES = new MqttProperties(
            true, "tcp://localhost:1883", "terrabyte-backend", "u", "p", "tb/v2",
            Duration.ofSeconds(10), Duration.ofSeconds(30), false, Duration.ofSeconds(5));

    private static final String TELEMETRY_TOPIC = "tb/v2/orangepi-pro-01/up/telemetry";

    /** Releases any subscribe left parked by a test, so teardown cannot hang. */
    private final CountDownLatch releaseSubscribe = new CountDownLatch(1);

    private MqttClient mqttClient;
    private RecordingHandler handler;
    private MqttUplinkRouter router;

    @BeforeEach
    void setUp() {
        mqttClient = mock(MqttClient.class);
        handler = new RecordingHandler();
        router = new MqttUplinkRouter(
                mqttClient, new MqttConnectOptions(), PROPERTIES, List.of(handler));
    }

    @AfterEach
    void tearDown() throws Exception {
        releaseSubscribe.countDown();
        router.stop();
    }

    /**
     * The regression this file exists for.
     *
     * <p>Paho drives {@code connectComplete} and {@code messageArrived} from one
     * callback thread, and its receiver thread stops reading the socket once ten
     * messages are queued for that thread. Subscribing inline therefore
     * deadlocks the client: the callback thread waits for a SUBACK that only the
     * receiver thread can read, and the receiver thread waits for the callback
     * thread to drain the queue. Nothing is acknowledged after that, so the
     * broker's inflight window fills and telemetry ingestion stops permanently.
     *
     * <p>The stubbed subscribe below never returns on its own, exactly like a
     * SUBACK that cannot be read. The callback thread must survive it anyway.
     */
    @Test
    void connectCompleteReturnsWithoutWaitingForTheSuback() throws Exception {
        CountDownLatch subscribeEntered = new CountDownLatch(1);
        AtomicReference<Thread> subscribeThread = new AtomicReference<>();
        doAnswer(invocation -> {
            subscribeThread.set(Thread.currentThread());
            subscribeEntered.countDown();
            releaseSubscribe.await(30, TimeUnit.SECONDS);
            return null;
        }).when(mqttClient).subscribe(anyString(), anyInt());

        Thread callbackThread = new Thread(
                () -> router.connectComplete(true, "tcp://mosquitto:1883"), "paho-callback");
        callbackThread.start();

        assertThat(subscribeEntered.await(5, TimeUnit.SECONDS))
                .as("subscribe never ran at all")
                .isTrue();
        callbackThread.join(5_000);

        assertThat(callbackThread.isAlive())
                .as("connectComplete blocked the Paho callback thread waiting on a SUBACK, "
                        + "which deadlocks delivery so no message is ever acknowledged")
                .isFalse();
        assertThat(subscribeThread.get())
                .as("subscribe must not run on the Paho callback thread")
                .isNotSameAs(callbackThread);
    }

    @Test
    void subscribesEveryRouteOnConnect() throws Exception {
        router.connectComplete(false, "tcp://mosquitto:1883");

        verify(mqttClient, timeout(5_000)).subscribe("tb/v2/+/up/telemetry", 1);
    }

    @Test
    void acknowledgesAfterSuccessfulIngest() throws Exception {
        router.messageArrived(TELEMETRY_TOPIC, message("{\"ok\":true}"));

        assertThat(handler.calls).isEqualTo(1);
        verify(mqttClient).messageArrivedComplete(anyInt(), anyInt());
    }

    /**
     * The deliberate half of the policy: a failure a retry could fix keeps the
     * message on the broker rather than losing the sample.
     */
    @Test
    void leavesAMessageUnacknowledgedWhenIngestFailsTransiently() throws Exception {
        handler.outcome = Outcome.TRANSIENT_FAILURE;

        router.messageArrived(TELEMETRY_TOPIC, message("{\"ok\":true}"));

        verify(mqttClient, never()).messageArrivedComplete(anyInt(), anyInt());
    }

    /**
     * A defect escaping a handler fails identically on every redelivery, so
     * holding the message back would not retry it — it would wedge the inflight
     * window and take every later sample down with it.
     */
    @Test
    void acknowledgesAndDropsAMessageNoHandlerCanEverProcess() throws Exception {
        handler.outcome = Outcome.DEFECT;

        router.messageArrived(TELEMETRY_TOPIC, message("{\"broken\":true}"));

        verify(mqttClient).messageArrivedComplete(anyInt(), anyInt());
    }

    @Test
    void acknowledgesAMessageOnAnUnrecognisedTopic() throws Exception {
        router.messageArrived("tb/v2/orangepi-pro-01/up/mystery", message("{}"));

        assertThat(handler.calls).isZero();
        verify(mqttClient).messageArrivedComplete(anyInt(), anyInt());
    }

    private static MqttMessage message(String json) {
        MqttMessage message = new MqttMessage(json.getBytes(StandardCharsets.UTF_8));
        message.setQos(1);
        return message;
    }

    private enum Outcome { HANDLED, TRANSIENT_FAILURE, DEFECT }

    private static final class RecordingHandler implements MqttUplinkHandler {

        private volatile Outcome outcome = Outcome.HANDLED;
        private volatile int calls;

        @Override
        public String topicSuffix() {
            return "telemetry";
        }

        @Override
        public boolean handle(String gatewayId, MqttMessage message) {
            calls++;
            return switch (outcome) {
                case HANDLED -> true;
                case TRANSIENT_FAILURE -> false;
                case DEFECT -> throw new IllegalStateException("handler defect");
            };
        }
    }
}
