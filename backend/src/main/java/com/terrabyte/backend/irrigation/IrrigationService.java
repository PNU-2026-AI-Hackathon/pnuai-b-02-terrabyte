package com.terrabyte.backend.irrigation;

import java.time.Clock;
import java.util.Optional;

import com.terrabyte.backend.ai.AiOutcome;
import com.terrabyte.backend.ai.IrrigationPredictionRequest;
import com.terrabyte.backend.ai.IrrigationVolumeResolver;
import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.measurement.MeasurementStore;
import com.terrabyte.backend.measurement.TelemetrySample;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Turns "this pot needs water" into an authorised, recorded command.
 *
 * <p>Order matters and is the whole point: the AI only ever proposes a number,
 * and that number then meets {@link IrrigationGovernor} exactly like a manual
 * request would. There is no path from a model output to a pump that skips the
 * gates.
 */
@Service
public class IrrigationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(IrrigationService.class);

    /**
     * Must match the AI server's {@code input_schema_version}; a mismatch makes
     * it refuse rather than answer for a contract it does not implement.
     */
    private static final int SCHEMA_VERSION = 1;

    private final IrrigationGovernor governor;
    private final IrrigationVolumeResolver volumeResolver;
    private final DeviceCommandRepository commandRepository;
    private final MeasurementStore measurementStore;
    private final PotRepository potRepository;
    private final IrrigationProperties properties;
    private final CommandDispatcher dispatcher;
    private final Clock clock;

    public IrrigationService(
            IrrigationGovernor governor,
            IrrigationVolumeResolver volumeResolver,
            DeviceCommandRepository commandRepository,
            MeasurementStore measurementStore,
            PotRepository potRepository,
            IrrigationProperties properties,
            CommandDispatcher dispatcher,
            Clock clock) {
        this.governor = governor;
        this.volumeResolver = volumeResolver;
        this.commandRepository = commandRepository;
        this.measurementStore = measurementStore;
        this.potRepository = potRepository;
        this.properties = properties;
        this.dispatcher = dispatcher;
        this.clock = clock;
    }

    /**
     * The rule engine decided water is needed; ask the AI how much and proceed.
     *
     * <p>The AI's answer is advisory. If it is unreachable, slow, disagrees on
     * the schema version, or returns something out of range, the resolver
     * substitutes a volume from the pot-size table and the request continues —
     * an AI outage must never stop a plant from being watered, and must never
     * water it more than the envelope allows either.
     */
    public IrrigationOutcome requestAutomatic(long potId, String correlationId) {
        Pot pot = requirePot(potId);
        TelemetrySample sample = measurementStore.findLatest(potId).orElse(null);

        IrrigationVolumeResolver.ResolvedVolume resolved =
                volumeResolver.resolveVolume(pot.substrateVolumeMl(), features(pot, sample));

        CommandSource source =
                resolved.outcome() == AiOutcome.OK ? CommandSource.RULE_AI : CommandSource.RULE;

        AuthorizationResult result = governor.authorize(
                IrrigationRequest.automatic(potId, resolved.volumeMl(), source, correlationId));

        return complete(result, resolved);
    }

    /** Someone tapped the button in the app. */
    public IrrigationOutcome requestManual(
            long potId, int requestedMl, boolean cooldownOverride, String overrideReason) {

        requirePot(potId);
        AuthorizationResult result = governor.authorize(new IrrigationRequest(
                potId, requestedMl, CommandSource.MANUAL,
                "manual-" + clock.instant().toEpochMilli(), cooldownOverride, overrideReason));

        return complete(result, null);
    }

    private IrrigationOutcome complete(
            AuthorizationResult result, IrrigationVolumeResolver.ResolvedVolume resolved) {

        if (result instanceof AuthorizationResult.Denied denied) {
            return IrrigationOutcome.denied(
                    denied.reason(), denied.detail(), denied.nextAvailableAt());
        }

        AuthorizationResult.Granted granted = (AuthorizationResult.Granted) result;
        IrrigationGrant grant = granted.grant();

        // The command row is written before dispatch, not after. If the process
        // dies between the two, the budget still counts this volume — the
        // conservative direction. The reverse ordering could water twice.
        commandRepository.save(new DeviceCommand(
                grant.commandId(),
                grant.potId(),
                grant.correlationId(),
                DeviceCommand.ACTUATOR_PUMP,
                DeviceCommand.ACTION_DOSE,
                grant.grantedMl(),
                grant.maxRuntimeMs(),
                CommandState.ISSUED,
                grant.issuedAt(),
                grant.expiresAt(),
                null, null, null, null, null,
                grant.origin()));

        boolean dispatched = dispatcher.dispatch(grant);
        if (!dispatched) {
            LOGGER.warn(
                    "irrigation authorised but not delivered command_id={} pot_id={}",
                    grant.commandId(), grant.potId());
        }

        return IrrigationOutcome.granted(
                grant,
                granted.clampReason(),
                dispatched,
                resolved == null ? null : resolved.outcome(),
                resolved == null ? null : resolved.modelVersion());
    }

    private IrrigationPredictionRequest features(Pot pot, TelemetrySample sample) {
        if (sample == null) {
            // No reading at all. The Governor refuses on gate 1 regardless, so
            // this only has to be well-formed — the refusal stays decided in
            // exactly one place.
            return new IrrigationPredictionRequest(
                    SCHEMA_VERSION, pot.cropCode(), pot.substrateVolumeMl(),
                    null, null, null, null, null, null);
        }
        return new IrrigationPredictionRequest(
                SCHEMA_VERSION,
                pot.cropCode(),
                pot.substrateVolumeMl(),
                sample.soilMoisturePct(),
                sample.soilTemperatureC(),
                sample.airTemperatureC(),
                sample.airHumidityPct(),
                sample.plantLightPpfdUmolM2S(),
                hoursSinceLastIrrigation(pot.id()));
    }

    private Double hoursSinceLastIrrigation(long potId) {
        Optional<java.time.Instant> last = commandRepository.lastCompletedAt(potId);
        return last
                .map(instant ->
                        java.time.Duration.between(instant, clock.instant()).toMinutes() / 60.0)
                .orElse(null);
    }

    private Pot requirePot(long potId) {
        return potRepository
                .findById(potId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND, "POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
    }
}
