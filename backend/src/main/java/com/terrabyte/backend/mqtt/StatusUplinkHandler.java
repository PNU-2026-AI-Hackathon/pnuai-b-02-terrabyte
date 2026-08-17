package com.terrabyte.backend.mqtt;

import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.measurement.MeasurementService;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Records a gateway going online or offline from {@code up/status}. */
@Component
public class StatusUplinkHandler implements MqttUplinkHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(StatusUplinkHandler.class);

    private final MeasurementService measurementService;
    private final ObjectMapper objectMapper;

    public StatusUplinkHandler(MeasurementService measurementService, ObjectMapper objectMapper) {
        this.measurementService = measurementService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String topicSuffix() {
        return "status";
    }

    @Override
    public boolean handle(String gatewayId, MqttMessage message) {
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
