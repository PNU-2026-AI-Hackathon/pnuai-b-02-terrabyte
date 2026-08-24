package com.terrabyte.backend.mqtt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.terrabyte.backend.device.DeviceRepository;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * The gateway uses this to tell a dead application from a live broker, so the
 * transport choices matter as much as the payload. See {@link HeartbeatMessage}.
 */
class BackendHeartbeatPublisherTests {

    private static final Instant NOW = Instant.parse("2026-08-25T03:04:05Z");

    private MqttClient mqttClient;
    private DeviceRepository deviceRepository;
    private BackendHeartbeatPublisher publisher;

    @BeforeEach
    void setUp() {
        mqttClient = mock(MqttClient.class);
        deviceRepository = mock(DeviceRepository.class);
        when(mqttClient.isConnected()).thenReturn(true);
        publisher = new BackendHeartbeatPublisher(
                mqttClient,
                new MqttProperties(
                        true, "tcp://localhost:1883", "terrabyte-backend", null, null,
                        "tb/v2", null, null, false, null),
                contractMapper(),
                deviceRepository,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    /**
     * Mirrors Spring Boot's auto-configured mapper, which is what the bean gets
     * in production. A bare {@code new ObjectMapper()} writes an Instant as epoch
     * seconds, and {@code sent_at} is part of the wire contract.
     */
    private static ObjectMapper contractMapper() {
        return new ObjectMapper()
                .findAndRegisterModules()
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    private MqttMessage capturePublish(String expectedTopic) throws Exception {
        ArgumentCaptor<String> topic = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<MqttMessage> message = ArgumentCaptor.forClass(MqttMessage.class);
        verify(mqttClient).publish(topic.capture(), message.capture());
        assertThat(topic.getValue()).isEqualTo(expectedTopic);
        return message.getValue();
    }

    @Test
    void publishesOneHeartbeatPerGatewayOnItsOwnDownlinkTopic() throws Exception {
        when(deviceRepository.findAllGatewayHardwareIds())
                .thenReturn(List.of("orangepi-pro-01", "orangepi-pro-02"));

        assertThat(publisher.publishOnce()).isEqualTo(2);

        verify(mqttClient).publish(eq(topicFor("orangepi-pro-01")), any(MqttMessage.class));
        verify(mqttClient).publish(eq(topicFor("orangepi-pro-02")), any(MqttMessage.class));
    }

    private static String topicFor(String gatewayId) {
        return "tb/v2/%s/dn/heartbeat".formatted(gatewayId);
    }

    @Test
    void thePayloadNamesTheGatewayAndTheMomentItWasSent() throws Exception {
        when(deviceRepository.findAllGatewayHardwareIds()).thenReturn(List.of("orangepi-pro-01"));

        publisher.publishOnce();

        MqttMessage message = capturePublish(topicFor("orangepi-pro-01"));
        JsonNode payload = contractMapper().readTree(message.getPayload());
        assertThat(payload.get("schema_version").asInt()).isEqualTo(2);
        assertThat(payload.get("message_type").asText()).isEqualTo("heartbeat");
        assertThat(payload.get("gateway_id").asText()).isEqualTo("orangepi-pro-01");
        assertThat(payload.get("sent_at").asText()).contains("2026-08-25T03:04:05");
    }

    /**
     * QoS 0. A heartbeat asserts liveness now; a queued redelivery would let a
     * gateway conclude the cloud was alive at a moment when it was not.
     */
    @Test
    void isSentAtMostOnceAndNeverRetained() throws Exception {
        when(deviceRepository.findAllGatewayHardwareIds()).thenReturn(List.of("orangepi-pro-01"));

        publisher.publishOnce();

        MqttMessage message = capturePublish(topicFor("orangepi-pro-01"));
        assertThat(message.getQos()).isZero();
        assertThat(message.isRetained()).isFalse();
    }

    @Test
    void publishesNothingWhenTheBrokerIsNotConnected() throws Exception {
        when(mqttClient.isConnected()).thenReturn(false);

        assertThat(publisher.publishOnce()).isZero();

        verify(mqttClient, never()).publish(anyString(), any(MqttMessage.class));
        // The gateway list is not even read: a disconnected client has nothing to
        // say, and the query would be pure load every 30 seconds.
        verify(deviceRepository, never()).findAllGatewayHardwareIds();
    }

    /**
     * One unreachable gateway must not silence the rest. From a gateway's side an
     * undelivered heartbeat and a dead application look the same, which is a true
     * statement — but only about that gateway.
     */
    @Test
    void aFailedPublishDoesNotStopTheRemainingGateways() throws Exception {
        when(deviceRepository.findAllGatewayHardwareIds())
                .thenReturn(List.of("bad", "orangepi-pro-02"));
        doThrow(new MqttException(MqttException.REASON_CODE_CLIENT_TIMEOUT))
                .when(mqttClient)
                .publish(eq(topicFor("bad")), any(MqttMessage.class));

        assertThat(publisher.publishOnce()).isEqualTo(1);

        verify(mqttClient).publish(eq(topicFor("orangepi-pro-02")), any(MqttMessage.class));
    }

    /**
     * A gateway id carrying a wildcard would address every gateway at once.
     * MqttProperties rejects it; this pins that the rejection is survivable here
     * rather than ending the round.
     */
    @Test
    void aGatewayIdThatCannotBeAddressedIsSkipped() throws Exception {
        when(deviceRepository.findAllGatewayHardwareIds())
                .thenReturn(List.of("+", "orangepi-pro-02"));

        assertThat(publisher.publishOnce()).isEqualTo(1);

        verify(mqttClient).publish(eq(topicFor("orangepi-pro-02")), any(MqttMessage.class));
    }

    @Test
    void noGatewaysMeansNoPublishes() throws Exception {
        when(deviceRepository.findAllGatewayHardwareIds()).thenReturn(List.of());

        assertThat(publisher.publishOnce()).isZero();

        verify(mqttClient, never()).publish(anyString(), any(MqttMessage.class));
    }
}
