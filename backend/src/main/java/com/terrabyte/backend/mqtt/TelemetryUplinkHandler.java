package com.terrabyte.backend.mqtt;

import java.util.Set;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.measurement.MeasurementService;
import com.terrabyte.backend.measurement.TelemetryEnvelope;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Hands {@code up/telemetry} to {@link MeasurementService}.
 *
 * <p>This is the only place in the backend that trusts a topic (not a request
 * body) as the caller's identity, because the broker ACL — not this code — is
 * what actually stops a gateway from publishing under another gateway's id. The
 * {@code gatewayId} argument arrives already parsed by {@link MqttUplinkRouter}.
 */
@Component
public class TelemetryUplinkHandler implements MqttUplinkHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(TelemetryUplinkHandler.class);

    private final MeasurementService measurementService;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    public TelemetryUplinkHandler(
            MeasurementService measurementService, ObjectMapper objectMapper, Validator validator) {
        this.measurementService = measurementService;
        this.objectMapper = objectMapper;
        this.validator = validator;
    }

    @Override
    public String topicSuffix() {
        return "telemetry";
    }

    @Override
    public boolean handle(String gatewayId, MqttMessage message) {
        TelemetryEnvelope envelope;
        try {
            envelope = objectMapper.readValue(message.getPayload(), TelemetryEnvelope.class);
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
}
