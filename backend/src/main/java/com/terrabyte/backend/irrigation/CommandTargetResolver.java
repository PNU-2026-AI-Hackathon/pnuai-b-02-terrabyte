package com.terrabyte.backend.irrigation;

import java.util.Optional;

import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Answers "which gateway and which node does this pot live behind".
 *
 * <p>An {@link IrrigationGrant} carries only a {@code potId}, while the downlink
 * topic needs a gateway id and the payload needs a node id. Neither is a column
 * on {@code device_command}, so this is a join at publish time: pot gives
 * {@code device_id} and {@code node_id}, and the gateway's identity is
 * {@code device.hardware_id} — not {@code serial_code}, which is the six-digit
 * registration number a person types into the app and has nothing to do with
 * MQTT.
 *
 * <p><strong>Deliberately one-directional.</strong> There is no method here that
 * turns a {@code (gateway, node)} pair back into a pot, and there must not be:
 * no constraint makes {@code node_id} unique across devices, so such a lookup
 * would be a guess wearing the costume of a lookup. Anything that needs to
 * validate an inbound message resolves forwards from its {@code command_id}
 * instead and compares — see {@link CommandAckService}.
 */
@Component
public class CommandTargetResolver {

    private static final Logger LOGGER = LoggerFactory.getLogger(CommandTargetResolver.class);

    private final PotRepository potRepository;
    private final DeviceRepository deviceRepository;

    public CommandTargetResolver(
            PotRepository potRepository, DeviceRepository deviceRepository) {
        this.potRepository = potRepository;
        this.deviceRepository = deviceRepository;
    }

    /**
     * @return empty when the pot, its device, or the device's hardware id is
     *         missing. Empty is a real answer: a device row created by the
     *         six-digit test claim code has no {@code hardware_id} at all, and a
     *         command for one of those has nowhere to go.
     */
    public Optional<CommandTarget> resolve(long potId) {
        Optional<Pot> pot = potRepository.findById(potId);
        if (pot.isEmpty()) {
            LOGGER.warn("cannot resolve command target: no pot pot_id={}", potId);
            return Optional.empty();
        }
        Optional<Device> device = deviceRepository.findById(pot.get().deviceId());
        if (device.isEmpty()) {
            LOGGER.warn(
                    "cannot resolve command target: no device pot_id={} device_id={}",
                    potId, pot.get().deviceId());
            return Optional.empty();
        }
        String hardwareId = device.get().hardwareId();
        if (hardwareId == null || hardwareId.isBlank()) {
            LOGGER.warn(
                    "cannot resolve command target: device has no hardware id "
                            + "pot_id={} device_id={}",
                    potId, device.get().id());
            return Optional.empty();
        }
        return Optional.of(new CommandTarget(potId, hardwareId, pot.get().nodeId()));
    }

    /**
     * @param gatewayId {@code device.hardware_id}; never blank
     * @param nodeId    null until the node has introduced itself over telemetry.
     *                  A resolvable target with no node is still useful — it is
     *                  what an inbound ack is authenticated against — but it
     *                  cannot be published to
     */
    public record CommandTarget(long potId, String gatewayId, String nodeId) {

        /** Whether this target is complete enough to address a command to. */
        public boolean isAddressable() {
            return nodeId != null && !nodeId.isBlank();
        }
    }
}
