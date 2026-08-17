package com.terrabyte.backend.mqtt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.eclipse.paho.client.mqttv3.MqttTopic;
import org.junit.jupiter.api.Test;

/**
 * Topic construction and parsing, the one place the transport decides identity.
 */
class MqttTopicTests {

    private static final MqttProperties PROPERTIES = new MqttProperties(
            true, "tcp://localhost:1883", "terrabyte-backend", "u", "p", "tb/v2",
            Duration.ofSeconds(10), Duration.ofSeconds(30), false, Duration.ofSeconds(5));

    @Test
    void buildsTheDownlinkTopicForOneNamedGateway() {
        assertThat(PROPERTIES.downlinkTopic("orangepi-pro-01", "command"))
                .isEqualTo("tb/v2/orangepi-pro-01/dn/command");
    }

    @Test
    void refusesAGatewayIdThatWouldTurnOneCommandIntoABroadcast() {
        // A '+' here matches every gateway on the broker. One malformed
        // hardware_id would water every pot on the estate.
        assertThatThrownBy(() -> PROPERTIES.downlinkTopic("+", "command"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PROPERTIES.downlinkTopic("#", "command"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PROPERTIES.downlinkTopic("a/b", "command"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PROPERTIES.downlinkTopic(" ", "command"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theAckFilterMatchesAnAckTopicAndNothingElse() {
        String ackFilter = PROPERTIES.uplinkFilter(CommandAckMessage.SUFFIX);

        assertThat(ackFilter).isEqualTo("tb/v2/+/up/ack");
        assertThat(MqttTopic.isMatched(ackFilter, "tb/v2/orangepi-pro-01/up/ack")).isTrue();
        // The router relies on the three uplink filters being disjoint, so that
        // the first match is the only match.
        assertThat(MqttTopic.isMatched(ackFilter, "tb/v2/orangepi-pro-01/up/telemetry")).isFalse();
        assertThat(MqttTopic.isMatched(ackFilter, "tb/v2/orangepi-pro-01/dn/command")).isFalse();
        assertThat(MqttTopic.isMatched(PROPERTIES.uplinkFilter("telemetry"),
                "tb/v2/orangepi-pro-01/up/ack")).isFalse();
    }

    @Test
    void extractsTheGatewayIdFromAnAckTopic() {
        assertThat(PROPERTIES.gatewayIdFromTopic("tb/v2/orangepi-pro-01/up/ack"))
                .isEqualTo("orangepi-pro-01");
    }
}
