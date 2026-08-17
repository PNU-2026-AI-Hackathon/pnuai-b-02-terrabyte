package com.terrabyte.backend.mqtt;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.MqttTopic;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Owns the broker connection and routes each uplink to its {@link MqttUplinkHandler}.
 *
 * <p>This is the one callback Paho allows, and it holds three responsibilities
 * that cannot be split any further: the subscription list, the topic parse, and
 * the acknowledgement policy. Everything that varies per uplink kind lives in a
 * handler instead.
 *
 * <p>Conditional on {@code app.mqtt.enabled} for the same reason as
 * {@link MqttConfig}: no broker is available in tests or a plain local run. The
 * handlers themselves are <em>not</em> conditional — they have no broker
 * dependency, so leaving them unconditional keeps them unit-testable and makes
 * this class the single gate. A handler bean with no router simply never runs.
 */
@Component
@ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "true")
public class MqttUplinkRouter implements MqttCallbackExtended {

    private static final Logger LOGGER = LoggerFactory.getLogger(MqttUplinkRouter.class);

    /** Every uplink in the contract is QoS 1; only the downlink heartbeat is QoS 0. */
    private static final int UPLINK_QOS = 1;

    private final MqttClient mqttClient;
    private final MqttConnectOptions connectOptions;
    private final MqttProperties mqttProperties;

    /** Topic filter to handler, in declaration order. Filters are disjoint. */
    private final Map<String, MqttUplinkHandler> routes = new LinkedHashMap<>();

    public MqttUplinkRouter(
            MqttClient mqttClient,
            MqttConnectOptions connectOptions,
            MqttProperties mqttProperties,
            List<MqttUplinkHandler> handlers) {
        this.mqttClient = mqttClient;
        this.connectOptions = connectOptions;
        this.mqttProperties = mqttProperties;
        for (MqttUplinkHandler handler : handlers) {
            String filter = mqttProperties.uplinkFilter(handler.topicSuffix());
            MqttUplinkHandler previous = routes.put(filter, handler);
            if (previous != null) {
                // Two handlers claiming one suffix means one of them silently
                // never runs, which is invisible at runtime. Fail at startup.
                throw new IllegalStateException(
                        "two handlers claim the same uplink suffix: " + handler.topicSuffix());
            }
        }
    }

    @PostConstruct
    public void start() throws MqttException {
        mqttClient.setCallback(this);
        mqttClient.connect(connectOptions);
    }

    @PreDestroy
    public void stop() throws MqttException {
        if (mqttClient.isConnected()) {
            mqttClient.disconnect();
        }
        mqttClient.close();
    }

    /**
     * Fires on the first successful connect and every automatic reconnect.
     * Subscriptions live here, not in {@link #start()}, because Paho's
     * automatic reconnect restores the transport but not the subscription
     * list when {@code cleanSession} is true — without re-subscribing here
     * a reconnected client would silently stop receiving telemetry.
     */
    @Override
    public void connectComplete(boolean reconnect, String serverURI) {
        LOGGER.info(
                "mqtt connected reconnect={} server={} subscriptions={}",
                reconnect, serverURI, routes.keySet());
        for (String filter : routes.keySet()) {
            try {
                mqttClient.subscribe(filter, UPLINK_QOS);
            } catch (MqttException e) {
                // One failed subscribe must not abandon the others: losing
                // telemetry and losing command acks are separate outages.
                LOGGER.error("mqtt subscribe failed filter={} reconnect={}", filter, reconnect, e);
            }
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        LOGGER.warn("mqtt connection lost, automatic reconnect will retry", cause);
    }

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) {
        // Downlink publishes are awaited on their own token by the dispatcher,
        // so there is nothing to correlate here.
    }

    /**
     * Never let an exception escape to the Paho callback thread — that can
     * kill the client's internal delivery thread and silently stop all future
     * delivery.
     *
     * <p>The acknowledgement decides what happens next, and the two failure
     * kinds want opposite answers. A message that cannot be parsed or fails
     * validation is a poison message: redelivering it can never succeed, so it
     * is logged, dropped, and acknowledged. A message that parses but fails
     * downstream (the database is unreachable, say) is acknowledged only once
     * it is stored — leaving it unacknowledged is what gets it redelivered.
     *
     * <p>That distinction matters because the gateway cannot help here. Its
     * outbox releases a sample on the broker's PUBACK, which happens long
     * before this callback runs, so once the broker has taken the message the
     * backend is the only party still holding it.
     */
    @Override
    public void messageArrived(String topic, MqttMessage message) {
        boolean handled;
        try {
            handled = route(topic, message);
        } catch (Exception e) {
            LOGGER.error("unexpected failure handling mqtt message topic={}", topic, e);
            handled = false;
        }

        if (!handled) {
            // Leave it unacknowledged. The broker keeps it in this persistent
            // session and redelivers on the next reconnect, which is the only
            // remaining chance to store it: the gateway's outbox released the
            // sample when the broker acked the publish, not when we ingested it.
            return;
        }
        try {
            mqttClient.messageArrivedComplete(message.getId(), message.getQos());
        } catch (MqttException e) {
            LOGGER.error("failed to acknowledge mqtt message topic={}", topic, e);
        }
    }

    /** @return true when the message is finished with and may be acknowledged. */
    private boolean route(String topic, MqttMessage message) {
        MqttUplinkHandler handler = null;
        for (Map.Entry<String, MqttUplinkHandler> route : routes.entrySet()) {
            // Paho's own filter matcher rather than endsWith: it is the same
            // code the broker uses, so a topic this client subscribed to cannot
            // fail to match here.
            if (MqttTopic.isMatched(route.getKey(), topic)) {
                handler = route.getValue();
                break;
            }
        }
        if (handler == null) {
            LOGGER.warn("mqtt message on unrecognised topic={}", topic);
            return true;
        }

        String gatewayId;
        try {
            gatewayId = mqttProperties.gatewayIdFromTopic(topic);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("mqtt message on malformed topic={}", topic, e);
            return true;
        }
        return handler.handle(gatewayId, message);
    }
}
