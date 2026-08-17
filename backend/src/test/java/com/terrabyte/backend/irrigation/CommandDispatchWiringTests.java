package com.terrabyte.backend.irrigation;

import static org.assertj.core.api.Assertions.assertThat;

import com.terrabyte.backend.measurement.MeasurementStore;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Which dispatcher the default test context actually wires, and why.
 *
 * <p>The whole test suite depends on the answer. {@code app.mqtt.enabled}
 * defaults to false, so no {@link MqttClient} bean exists and nothing tries to
 * reach a broker — if that ever stopped being true, every
 * {@code @SpringBootTest} in the project would start attempting a TCP connect on
 * context load, which fails slowly and confusingly rather than quickly and
 * clearly. This test states it out loud so the regression is a one-line failure.
 */
@SpringBootTest
@ActiveProfiles("test")
class CommandDispatchWiringTests {

    @Autowired private ApplicationContext context;
    @Autowired private CommandDispatcher dispatcher;

    @MockitoBean private MeasurementStore measurementStore;

    @Test
    void theTestContextHasNoBrokerClient() {
        assertThat(context.getBeanNamesForType(MqttClient.class)).isEmpty();
    }

    @Test
    void theFallbackDispatcherIsTheOneInUse() {
        // Exactly one candidate: IrrigationConfig's @ConditionalOnMissingBean
        // fallback. The MQTT dispatcher is registered only when both
        // app.mqtt.enabled and app.mqtt.command-dispatch.enabled are true, and
        // it takes precedence by @Primary rather than by configuration-class
        // parse order, which is not guaranteed between two user @Configurations.
        assertThat(dispatcher).isInstanceOf(LoggingCommandDispatcher.class);
        assertThat(context.getBeanNamesForType(CommandDispatcher.class)).hasSize(1);
    }
}
