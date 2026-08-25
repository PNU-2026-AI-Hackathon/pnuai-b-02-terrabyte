package com.terrabyte.backend.irrigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Records that a command would have been sent, and says so loudly.
 *
 * <p>The alternative — quietly doing nothing — would make the irrigation path
 * look healthy in the timeline while no pump ever runs. This logs at WARN so that
 * "authorised but undelivered" stays visible.
 *
 * <p>Still the default. A real MQTT publisher exists, but it is off unless
 * {@code app.mqtt.command-dispatch.enabled} is set, so this is what runs in the
 * test suite, in a plain local {@code bootRun}, and in any deployment that has
 * not yet been switched over.
 */
public class LoggingCommandDispatcher implements CommandDispatcher {

    private static final Logger LOGGER = LoggerFactory.getLogger(LoggingCommandDispatcher.class);

    @Override
    public boolean dispatch(IrrigationGrant grant) {
        LOGGER.warn(
                "irrigation command not delivered: no downlink transport is configured "
                        + "(app.mqtt.command-dispatch.enabled is off) command_id={} pot_id={} "
                        + "granted_ml={} expires_at={}",
                grant.commandId(), grant.potId(), grant.grantedMl(), grant.expiresAt());
        return false;
    }

    @Override
    public boolean dispatchLight(
            DeviceCommand command, CommandTargetResolver.CommandTarget target) {
        LOGGER.warn(
                "light command authorised but not delivered: no downlink transport is configured "
                        + "(app.mqtt.command-dispatch.enabled is off) command_id={} pot_id={} "
                        + "action={} expires_at={}",
                command.commandId(), command.potId(), command.action(), command.expiresAt());
        return false;
    }
}
