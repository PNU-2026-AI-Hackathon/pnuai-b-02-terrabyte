package com.terrabyte.backend.irrigation;

/**
 * Delivers an authorised command to the gateway that will execute it.
 *
 * <p><strong>Nothing delivers commands yet.</strong> {@code MqttConfig} states
 * plainly that the backend never publishes, so the downlink topic
 * {@code tb/v2/{gatewayId}/dn/command} has no producer. That work — publishing,
 * acknowledgement, TTL expiry and completion reports — is issue #50, and the
 * actuator wiring it drives is #49.
 *
 * <p>This interface exists so the gap is a named seam rather than a silence.
 * The Governor is complete and its decisions are recorded; what is missing is
 * the last hop, and {@link LoggingCommandDispatcher} makes that visible in the
 * log instead of letting a caller assume a pump ran.
 */
public interface CommandDispatcher {

    /**
     * @return true when the command was handed to a transport that will attempt
     *         delivery. False means it was recorded but nobody will act on it.
     */
    boolean dispatch(IrrigationGrant grant);
}
