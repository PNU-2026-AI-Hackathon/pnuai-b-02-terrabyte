package com.terrabyte.backend.mqtt;

import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.measurement.MeasurementService;
import com.terrabyte.backend.measurement.TelemetryEnvelope;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Subscribes to gateway uplinks and hands them to {@link MeasurementService}.
 *
 * <p>This replaces the HTTP {@code /api/telemetry} endpoint as the
 * operational path between the Orange Pi gateway and the backend. It is the
 * only place in the backend that trusts a topic (not a request body) as the
 * caller's identity, because the broker ACL — not this code — is what
 * actually stops a gateway from publishing under another gateway's id.
 *
 * <p>Conditional on {@code app.mqtt.enabled} for the same reason as
 * {@link MqttConfig}: no broker is available in tests or a plain local run.
 */
@Component
@ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "true")
public class MqttTelemetrySubscriber implements MqttCallbackExtended {

    private static final Logger LOGGER = LoggerFactory.getLogger(MqttTelemetrySubscriber.class);
    private static final String TELEMETRY_SUFFIX = "telemetry";
    private static final String STATUS_SUFFIX = "status";

    private final MqttClient mqttClient;
    private final MqttConnectOptions connectOptions;
    private final MqttProperties mqttProperties;
    private final MeasurementService measurementService;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    public MqttTelemetrySubscriber(
            MqttClient mqttClient,
            MqttConnectOptions connectOptions,
            MqttProperties mqttProperties,
            MeasurementService measurementService,
            ObjectMapper objectMapper,
            Validator validator) {
        this.mqttClient = mqttClient;
        this.connectOptions = connectOptions;
        this.mqttProperties = mqttProperties;
        this.measurementService = measurementService;
        this.objectMapper = objectMapper;
        this.validator = validator;
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
        LOGGER.info("mqtt connected reconnect={} server={}", reconnect, serverURI);
        try {
            mqttClient.subscribe(mqttProperties.uplinkFilter(TELEMETRY_SUFFIX), 1);
            mqttClient.subscribe(mqttProperties.uplinkFilter(STATUS_SUFFIX), 1);
        } catch (MqttException e) {
            LOGGER.error("mqtt subscribe failed after connect, reconnect={}", reconnect, e);
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        LOGGER.warn("mqtt connection lost, automatic reconnect will retry", cause);
    }

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) {
        // No outbound publishes from this subscriber; nothing to acknowledge.
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
            if (topic.endsWith("/" + TELEMETRY_SUFFIX)) {
                handled = handleTelemetry(topic, message);
            } else if (topic.endsWith("/" + STATUS_SUFFIX)) {
                handled = handleStatus(topic, message);
            } else {
                LOGGER.warn("mqtt message on unrecognised topic={}", topic);
                handled = true;
            }
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
    private boolean handleTelemetry(String topic, MqttMessage message) {
        String gatewayId;
        try {
            gatewayId = mqttProperties.gatewayIdFromTopic(topic);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("mqtt telemetry on malformed topic={}", topic, e);
            return true;
        }

        TelemetryEnvelope envelope;
        try {
            envelope = objectMapper.readValue(
                    message.getPayload(), TelemetryEnvelope.class);
        } catch (Exception e) {
            LOGGER.warn("dropping unparsable telemetry gateway_id={}", gatewayId, e);
            return true;
        }

        Set<ConstraintViolation<TelemetryEnvelope>> violations = validator.validate(envelope);
        if (!violations.isEmpty()) {
            LOGGER.warn(
                    "dropping invalid telemetry gateway_id={} violations={}",
                    gatewayId,
                    violations.stream()
                            .map(v -> v.getPropertyPath() + " " + v.getMessage())
                            .collect(Collectors.joining("; ")));
            return true;
        }

        try {
            measurementService.ingest(gatewayId, envelope);
            return true;
        } catch (Exception e) {
            // Transient failure such as an unreachable database. Reporting it
            // as unhandled leaves the message unacknowledged so the broker
            // redelivers it, which is what makes ingestion durable rather than
            // best-effort. Duplicate delivery is already harmless: the service
            // deduplicates on event_id.
            LOGGER.error(
                    "failed to ingest telemetry gateway_id={} event_id={}",
                    gatewayId,
                    envelope.eventId(),
                    e);
            return false;
        }
    }

    private boolean handleStatus(String topic, MqttMessage message) {
        String gatewayId;
        try {
            gatewayId = mqttProperties.gatewayIdFromTopic(topic);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("mqtt status on malformed topic={}", topic, e);
            return true;
        }

        try {
            String payload = new String(message.getPayload(), StandardCharsets.UTF_8);
            StatusPayload status = objectMapper.readValue(payload, StatusPayload.class);
            measurementService.updateGatewayPresence(gatewayId, status.online());
            return true;
        } catch (Exception e) {
            // Presence is republished retained on every reconnect, so a lost
            // status message self-heals. No point holding up the session for it.
            LOGGER.error("failed to process status gateway_id={}", gatewayId, e);
            return true;
        }
    }

    /** {"online": true|false} — retained, and also this gateway's MQTT Last Will. */
    private record StatusPayload(boolean online) {
    }
}
