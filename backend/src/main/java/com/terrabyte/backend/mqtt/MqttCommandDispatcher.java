package com.terrabyte.backend.mqtt;

import java.time.Clock;
import java.time.Duration;
import java.util.Optional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.irrigation.CommandDispatcher;
import com.terrabyte.backend.irrigation.CommandTargetResolver;
import com.terrabyte.backend.irrigation.CommandTargetResolver.CommandTarget;
import com.terrabyte.backend.irrigation.IrrigationGrant;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Publishes an authorised command to the gateway that will execute it.
 *
 * <p>Lives in the {@code mqtt} package rather than next to the Governor
 * deliberately: {@code irrigation} owns the decision and the record, and knows
 * nothing about how the decision travels. A transport in the domain package
 * would reverse that.
 *
 * <p>Registered as a bean by {@link MqttConfig} and off unless
 * {@code app.mqtt.command-dispatch.enabled} says otherwise, so this can be merged
 * and reviewed while no environment is yet moving water on it.
 */
public class MqttCommandDispatcher implements CommandDispatcher {

    private static final Logger LOGGER = LoggerFactory.getLogger(MqttCommandDispatcher.class);

    private static final int QOS_AT_LEAST_ONCE = 1;

    /**
     * Never retain a command.
     *
     * <p>A retained command is delivered again to every future subscriber of the
     * topic, so each gateway reconnect — a Wi-Fi blip, a service restart — would
     * replay the last irrigation immediately and unconditionally, TTL and all.
     * {@code up/status} is the only topic in this contract that is retained.
     */
    private static final boolean RETAINED = false;

    private final MqttClient mqttClient;
    private final MqttProperties mqttProperties;
    private final ObjectMapper objectMapper;
    private final CommandTargetResolver targetResolver;
    private final Duration publishTimeout;
    private final Clock clock;

    public MqttCommandDispatcher(
            MqttClient mqttClient,
            MqttProperties mqttProperties,
            ObjectMapper objectMapper,
            CommandTargetResolver targetResolver,
            Duration publishTimeout,
            Clock clock) {
        this.mqttClient = mqttClient;
        this.mqttProperties = mqttProperties;
        this.objectMapper = objectMapper;
        this.targetResolver = targetResolver;
        this.publishTimeout = publishTimeout;
        this.clock = clock;
    }

    /**
     * @return true only once the broker has acknowledged the publish. False is a
     *         truthful "nobody will act on this", which the API surfaces as
     *         {@code dispatched: false} — the caller must be able to tell a
     *         recorded command from a delivered one.
     */
    @Override
    public boolean dispatch(IrrigationGrant grant) {
        // The first of the TTL's three judgements. The Governor stamps expires_at
        // and stops there; until this check existed nothing owned the sentence
        // "if it has expired, do not send it", so a command delayed anywhere
        // between authorisation and here would still have gone out. The gateway
        // judges it again on receipt, and the sweep judges it a third time for
        // commands that were never answered — each layer is sometimes the only
        // one still running.
        if (grant.hasExpiredAt(clock.instant())) {
            LOGGER.warn(
                    "not publishing an expired command command_id={} pot_id={} expires_at={}",
                    grant.commandId(), grant.potId(), grant.expiresAt());
            return false;
        }

        Optional<CommandTarget> resolved = targetResolver.resolve(grant.potId());
        if (resolved.isEmpty()) {
            LOGGER.warn(
                    "not publishing, no gateway for pot command_id={} pot_id={}",
                    grant.commandId(), grant.potId());
            return false;
        }
        CommandTarget target = resolved.get();
        if (!target.isAddressable()) {
            // The pot exists and its gateway is known, but no node has claimed it
            // yet, so there is no addressee for the dose.
            LOGGER.warn(
                    "not publishing, pot has no bound node command_id={} pot_id={} gateway_id={}",
                    grant.commandId(), grant.potId(), target.gatewayId());
            return false;
        }

        String topic;
        byte[] payload;
        try {
            topic = mqttProperties.downlinkTopic(target.gatewayId(), CommandMessage.SUFFIX);
            payload = objectMapper.writeValueAsBytes(
                    CommandMessage.from(grant, target.gatewayId(), target.nodeId()));
        } catch (Exception e) {
            LOGGER.error(
                    "failed to build the command payload command_id={} pot_id={}",
                    grant.commandId(), grant.potId(), e);
            return false;
        }

        try {
            MqttMessage message = new MqttMessage(payload);
            message.setQos(QOS_AT_LEAST_ONCE);
            message.setRetained(RETAINED);
            // Published through the topic handle and awaited on its own token,
            // rather than the blocking MqttClient.publish, because that one waits
            // for as long as the client's timeToWait allows — unbounded by
            // default. This runs on the thread serving a user's tap, and the
            // whole command is only valid for two minutes, so waiting longer than
            // the bound is never useful.
            MqttDeliveryToken token = mqttClient.getTopic(topic).publish(message);
            token.waitForCompletion(publishTimeout.toMillis());
        } catch (Exception e) {
            // Includes the broker being unreachable, which is the ordinary case
            // rather than an exceptional one. The command row stays ISSUED and the
            // expiry sweep will retire it; nothing retries, because by the time a
            // retry succeeded the reading behind the decision would be stale.
            LOGGER.error(
                    "failed to publish command command_id={} pot_id={} topic={} connected={}",
                    grant.commandId(), grant.potId(), topic, mqttClient.isConnected(), e);
            return false;
        }

        LOGGER.info(
                "command published command_id={} pot_id={} gateway_id={} node_id={} "
                        + "granted_ml={} max_runtime_ms={} expires_at={}",
                grant.commandId(), grant.potId(), target.gatewayId(), target.nodeId(),
                grant.grantedMl(), grant.maxRuntimeMs(), grant.expiresAt());
        return true;
    }
}
