package com.terrabyte.backend.mqtt;

import java.time.Clock;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.device.DeviceRepository;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Publishes a sign of life to every gateway on a timer.
 *
 * <p>See {@link HeartbeatMessage} for why connection state is not a substitute.
 *
 * <p>Three transport choices, each load-bearing:
 *
 * <ul>
 *   <li><b>QoS 0.</b> A heartbeat asserts liveness <em>now</em>. Queueing one for
 *       redelivery would let a gateway conclude the cloud was alive at a moment
 *       when it was not, which is precisely the mistake this exists to prevent.
 *   <li><b>Never retained.</b> A retained heartbeat is handed to every future
 *       subscriber on connect, so a gateway reconnecting to a broker that had
 *       outlived the application would be told the application is fine.
 *   <li><b>Per gateway, not broadcast.</b> The ACL only lets a gateway read
 *       beneath its own id, so a shared topic would be unreadable by everyone.
 * </ul>
 *
 * <p>A failed publish is logged and swallowed. A heartbeat that cannot be sent
 * is indistinguishable, from the gateway's side, from an application that is
 * down — which is a true statement about a backend whose broker link is broken.
 * Letting the exception escape would only kill the scheduler thread and stop the
 * remaining gateways from hearing anything.
 */
public class BackendHeartbeatPublisher {

    private static final Logger LOGGER = LoggerFactory.getLogger(BackendHeartbeatPublisher.class);

    private static final int QOS_AT_MOST_ONCE = 0;
    private static final boolean RETAINED = false;

    private final MqttClient mqttClient;
    private final MqttProperties mqttProperties;
    private final ObjectMapper objectMapper;
    private final DeviceRepository deviceRepository;
    private final Clock clock;

    public BackendHeartbeatPublisher(
            MqttClient mqttClient,
            MqttProperties mqttProperties,
            ObjectMapper objectMapper,
            DeviceRepository deviceRepository,
            Clock clock) {
        this.mqttClient = mqttClient;
        this.mqttProperties = mqttProperties;
        this.objectMapper = objectMapper;
        this.deviceRepository = deviceRepository;
        this.clock = clock;
    }

    // Millisecond form to match ExpiredCommandSweeper, the other timed task in
    // this application. The initial delay keeps startup quiet while the Paho
    // client is still connecting.
    @Scheduled(
            initialDelayString = "${app.mqtt.heartbeat.initial-delay-ms:10000}",
            fixedDelayString = "${app.mqtt.heartbeat.interval-ms:30000}")
    public void publishHeartbeats() {
        publishOnce();
    }

    /**
     * Exposed so a test can drive one round without a scheduler racing it, the
     * same way {@code ExpiredCommandSweeper.sweepOnce()} is.
     *
     * @return how many gateways were successfully published to
     */
    public int publishOnce() {
        if (!mqttClient.isConnected()) {
            // Nothing to say and no way to say it. Not a warning: a disconnected
            // client is already reported by the connection listener, and one
            // line every 30 seconds would bury it.
            LOGGER.debug("skipping heartbeat, broker not connected");
            return 0;
        }

        List<String> gatewayIds = deviceRepository.findAllGatewayHardwareIds();
        int sent = 0;
        for (String gatewayId : gatewayIds) {
            if (publishTo(gatewayId)) {
                sent++;
            }
        }
        return sent;
    }

    private boolean publishTo(String gatewayId) {
        try {
            String topic = mqttProperties.downlinkTopic(gatewayId, HeartbeatMessage.SUFFIX);
            byte[] payload =
                    objectMapper.writeValueAsBytes(
                            HeartbeatMessage.now(gatewayId, clock.instant()));

            MqttMessage message = new MqttMessage(payload);
            message.setQos(QOS_AT_MOST_ONCE);
            message.setRetained(RETAINED);
            mqttClient.publish(topic, message);
            return true;
        } catch (Exception e) {
            LOGGER.warn("heartbeat publish failed gateway_id={}", gatewayId, e);
            return false;
        }
    }
}
