package com.terrabyte.backend.irrigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Records that a command would have been sent, and says so loudly.
 *
 * <p>The alternative — quietly doing nothing — would make the irrigation path
 * look healthy in the timeline while no pump ever runs. This logs at WARN so
 * that "authorised but undelivered" stays visible until #50 replaces it with a
 * real MQTT publisher.
 */
public class LoggingCommandDispatcher implements CommandDispatcher {

    private static final Logger LOGGER = LoggerFactory.getLogger(LoggingCommandDispatcher.class);

    @Override
    public boolean dispatch(IrrigationGrant grant) {
        LOGGER.warn(
                "irrigation command not delivered: no downlink transport is configured "
                        + "(see #50) command_id={} pot_id={} granted_ml={} expires_at={}",
                grant.commandId(), grant.potId(), grant.grantedMl(), grant.expiresAt());
        return false;
    }
}
