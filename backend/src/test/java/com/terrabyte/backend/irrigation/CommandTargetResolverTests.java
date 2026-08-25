package com.terrabyte.backend.irrigation;

import static org.assertj.core.api.Assertions.assertThat;

import com.terrabyte.backend.irrigation.CommandTargetResolver.CommandTarget;
import com.terrabyte.backend.measurement.MeasurementStore;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** The pot-to-gateway join, which is what addresses a command. */
@SpringBootTest
@ActiveProfiles("test")
class CommandTargetResolverTests {

    private static final long POT_ID = 1L;

    @Autowired private CommandTargetResolver resolver;

    @Autowired
    @Qualifier("postgresJdbcTemplate")
    private JdbcTemplate jdbcTemplate;

    @MockitoBean private MeasurementStore measurementStore;

    @AfterEach
    void unbindNode() {
        jdbcTemplate.update("UPDATE pot SET node_id = NULL WHERE id = ?", POT_ID);
    }

    @Test
    void resolvesTheGatewayFromTheHardwareIdNotTheSerialCode() {
        jdbcTemplate.update("UPDATE pot SET node_id = ? WHERE id = ?", "terrabyte-node-01", POT_ID);

        CommandTarget target = resolver.resolve(POT_ID).orElseThrow();

        // Device carries both a serial_code — the six digits a person types into
        // the app — and a hardware_id, which is the MQTT topic segment. Reading
        // the wrong column addresses the command to a gateway that does not
        // exist, and this is the assertion that catches it.
        assertThat(target.gatewayId()).isEqualTo(column("hardware_id"));
        assertThat(target.gatewayId()).isNotEqualTo(column("serial_code"));
        assertThat(target.nodeId()).isEqualTo("terrabyte-node-01");
        assertThat(target.isAddressable()).isTrue();
    }

    @Test
    void resolvesButIsNotAddressableUntilTheNodeHasIntroducedItself() {
        CommandTarget target = resolver.resolve(POT_ID).orElseThrow();

        // Enough to authenticate an inbound ack, not enough to publish to.
        assertThat(target.gatewayId()).isEqualTo(column("hardware_id"));
        assertThat(target.isAddressable()).isFalse();
    }

    private String column(String name) {
        return jdbcTemplate.queryForObject(
                "SELECT d." + name + " FROM device d JOIN pot p ON p.device_id = d.id"
                        + " WHERE p.id = ?",
                String.class,
                POT_ID);
    }

    @Test
    void hasNoAnswerForAPotThatDoesNotExist() {
        assertThat(resolver.resolve(-1L)).isEmpty();
    }
}
