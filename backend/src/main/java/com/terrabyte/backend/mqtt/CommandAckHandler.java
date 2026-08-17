package com.terrabyte.backend.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.irrigation.CommandAckService;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Feeds {@code up/ack} into the command state machine.
 *
 * <p>Thin on purpose: parse, hand over, translate the outcome into an
 * acknowledgement decision. Every judgement about what a report means belongs to
 * {@link CommandAckService}, which is also where it can be tested without a
 * broker.
 *
 * <p>The broker's session is persistent ({@code cleanSession=false}), so acks
 * produced while the backend was down are queued and arrive in a burst on
 * reconnect. Nothing here needs to know that — the state machine's guarded
 * updates make an old ack either applicable or a no-op, and a burst is just
 * several of those.
 */
@Component
public class CommandAckHandler implements MqttUplinkHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(CommandAckHandler.class);

    private final CommandAckService ackService;
    private final ObjectMapper objectMapper;

    public CommandAckHandler(CommandAckService ackService, ObjectMapper objectMapper) {
        this.ackService = ackService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String topicSuffix() {
        return CommandAckMessage.SUFFIX;
    }

    @Override
    public boolean handle(String gatewayId, MqttMessage message) {
        CommandAckMessage ack;
        try {
            ack = objectMapper.readValue(message.getPayload(), CommandAckMessage.class);
        } catch (Exception e) {
            LOGGER.warn("dropping unparsable command ack gateway_id={}", gatewayId, e);
            return true;
        }

        try {
            ackService.apply(gatewayId, ack.toDomain());
            // Applied, ignored and dropped are all final for this message: the
            // state machine has said its piece and redelivery cannot improve on
            // any of the three answers.
            return true;
        } catch (Exception e) {
            // Transient failure such as an unreachable database. Leaving the
            // message unacknowledged is the only way to get it back, and losing
            // an ack is expensive: the command stays counted against the pot's
            // budget at its granted volume for the next twenty-four hours.
            LOGGER.error(
                    "failed to apply command ack gateway_id={} command_id={} phase={}",
                    gatewayId, ack.commandId(), ack.phase(), e);
            return false;
        }
    }
}
