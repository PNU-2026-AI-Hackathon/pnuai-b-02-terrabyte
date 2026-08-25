package com.terrabyte.backend.irrigation;

/**
 * Delivers an authorised command to the gateway that will execute it.
 *
 * <p>Two implementations, and which one is in play is a deployment decision.
 * {@code MqttCommandDispatcher} publishes to
 * {@code tb/v2/{gatewayId}/dn/command} and is enabled by
 * {@code app.mqtt.command-dispatch.enabled}; {@link LoggingCommandDispatcher} is
 * the fallback for every environment without that flag, and it says so at WARN
 * rather than doing nothing quietly.
 *
 * <p>The interface stays because the seam is worth keeping named. The Governor's
 * decision and the {@code device_command} row are written either way, so this is
 * the only place the two configurations differ — and {@link #dispatch}'s return
 * value is what stops a caller from assuming a pump ran.
 */
public interface CommandDispatcher {

    /**
     * @return true when the command was handed to a transport that will attempt
     *         delivery. False means it was recorded but nobody will act on it.
     */
    boolean dispatch(IrrigationGrant grant);
}
