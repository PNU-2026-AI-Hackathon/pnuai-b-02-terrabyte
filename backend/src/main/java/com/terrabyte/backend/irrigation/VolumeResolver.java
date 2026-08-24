package com.terrabyte.backend.irrigation;

import com.terrabyte.backend.ai.AiOutcome;
import com.terrabyte.backend.ai.AiProperties;
import com.terrabyte.backend.ai.IrrigationAiClient;
import com.terrabyte.backend.ai.IrrigationPredictionRequest;
import com.terrabyte.backend.ai.IrrigationPredictionResponse;
import com.terrabyte.backend.measurement.IrrigationSuggestion;
import com.terrabyte.backend.measurement.TelemetrySample;
import com.terrabyte.backend.pot.Pot;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Decides how much water to <em>request</em> for one pot.
 *
 * <p>Three sources, tried in order, and never a fourth number invented here:
 *
 * <ol>
 *   <li>the AI server's prediction, when {@code app.ai.enabled} and the answer is
 *       in range and confident;
 *   <li>the edge's water-balance dose, shipped with the reading it was derived from;
 *   <li>a fixed pot-size table.
 * </ol>
 *
 * <p>The order is deliberate and each step is a strict fallback: the AI is the
 * only source that can be unreachable, so it is asked first and its failure costs
 * precision rather than the watering itself. With {@code app.ai.enabled=false} —
 * the default — no HTTP call is made and the behaviour is exactly the edge-then-table
 * path.
 *
 * <p>The value returned here is still a <em>request</em>. {@link IrrigationGovernor}
 * re-checks it against the per-dose ceiling and the daily budget before any
 * command is issued, so this is the first of two independent limits.
 */
@Component
public class VolumeResolver {

    private static final Logger log = LoggerFactory.getLogger(VolumeResolver.class);

    /**
     * The range a suggestion must fall in to be usable. Anything else is a broken edge.
     *
     * <p>The floor is 1, not 0. A 0 mL suggestion means the edge formula disagrees with
     * the rule engine that already decided this pot needs water — but overturning that
     * decision is not this class's job, and passing 0 on would have the Governor refuse
     * it as {@code AI_OUT_OF_RANGE}, filing a coherent answer in the audit trail under
     * a reason that misdescribes it. Falling back to the conservative table dose
     * resolves the disagreement in the correctable direction.
     */
    private static final int MIN_SUGGESTION_ML = 1;
    private static final int MAX_SUGGESTION_ML = 500;

    /** Null when this backend runs without an AI server, which is the default. */
    private final IrrigationAiClient aiClient;
    private final AiProperties aiProperties;

    // Explicit, because the AI-less constructor below makes the choice ambiguous.
    @Autowired
    public VolumeResolver(IrrigationAiClient aiClient, AiProperties aiProperties) {
        this.aiClient = aiClient;
        this.aiProperties = aiProperties;
    }

    /**
     * Wiring without an AI server: the model is never consulted and the edge
     * suggestion is the first source. Used by the tests that cover the local path.
     */
    VolumeResolver() {
        this(null, null);
    }

    /**
     * @param volumeMl     what the caller should request
     * @param source       what decided it
     * @param modelVersion the AI model or edge formula behind it, or null when the
     *                     table decided with nothing to attribute. Written to
     *                     {@code irrigation_decision.ai_model_version}
     * @param proposedMl   what the upstream source actually proposed, **kept even when
     *                     it was rejected as out of range**. Written to
     *                     {@code irrigation_decision.ai_requested_ml}. A 99999 that
     *                     survives only in a log line cannot be used to blame the model
     *                     afterwards; a stored one can.
     *
     *                     <p>One column, two possible proposers: when the AI answered at
     *                     all — even unusably — its number is the one stored, because a
     *                     deployment that turned the AI on is asking about the AI. The
     *                     edge's own number is still visible in the telemetry row that
     *                     carried it.
     */
    public record ResolvedVolume(
            int volumeMl, VolumeSource source, String modelVersion, Integer proposedMl) {
    }

    /**
     * The local answer only: edge suggestion, else the table. Equivalent to
     * {@link #resolve(Pot, TelemetrySample, IrrigationPredictionRequest)} with no
     * features to send, and the whole of it when the AI is disabled.
     *
     * @param pot    the pot being watered; also the reference the edge's own
     *               assumptions are checked against
     * @param sample the latest reading, or null when the pot has never reported
     */
    public ResolvedVolume resolve(Pot pot, TelemetrySample sample) {
        IrrigationSuggestion suggestion = sample == null ? null : sample.irrigationSuggestion();
        if (suggestion == null || suggestion.volumeMl() == null) {
            return fallback(pot, null, null);
        }

        int volumeMl = suggestion.volumeMl();
        if (volumeMl < MIN_SUGGESTION_ML || volumeMl > MAX_SUGGESTION_ML) {
            // Fall back, do NOT clamp. Clamping 99999 down to 500 would ship a
            // plausible-looking dose from an edge that is demonstrably broken and
            // hide the fault: the pot gets watered, the number looks ordinary,
            // and nobody learns the formula failed. Same reasoning as the
            // Governor's refusal of a non-positive request.
            log.warn(
                    "edge irrigation suggestion {} mL outside [{}, {}] for pot_id={} — "
                            + "falling back to the pot-size table (model {})",
                    volumeMl, MIN_SUGGESTION_ML, MAX_SUGGESTION_ML,
                    pot.id(), suggestion.modelVersion());
            return fallback(pot, suggestion.modelVersion(), volumeMl);
        }

        warnOnDrift(pot, suggestion);
        return new ResolvedVolume(
                volumeMl, VolumeSource.EDGE_SUGGESTION, suggestion.modelVersion(), volumeMl);
    }

    /**
     * Asks the AI first, and falls back through the edge to the table.
     *
     * <p>Nothing here can raise: {@link IrrigationAiClient} converts every failure
     * into an outcome, and any outcome other than a usable in-range prediction
     * simply leaves the local answer standing. An AI outage costs precision, never
     * the watering.
     *
     * @param features what to send the model, or null to skip the call entirely
     */
    public ResolvedVolume resolve(
            Pot pot, TelemetrySample sample, IrrigationPredictionRequest features) {

        ResolvedVolume local = resolve(pot, sample);
        if (aiClient == null || aiProperties == null || !aiProperties.enabled() || features == null) {
            return local;
        }

        IrrigationAiClient.Result result = aiClient.predictIrrigation(features);
        IrrigationPredictionResponse prediction = result.prediction();
        if (prediction == null) {
            // Disabled, timed out, transport error, unparseable body. The local
            // answer already covers this case and there is nothing to attribute.
            return local;
        }

        String modelVersion = prediction.modelVersion();
        if (result.outcome() != AiOutcome.OK) {
            // Schema mismatch, mainly: the body parsed, but its features are not the
            // features we sent, so its number means nothing. The model version is
            // still recorded — it names the artifact that has to be rolled back.
            return new ResolvedVolume(local.volumeMl(), local.source(), modelVersion, null);
        }

        int ml = prediction.volumeMl();
        if (ml < 0 || ml > aiProperties.hardCeilingMl()) {
            // Fall back, do NOT clamp — the same reasoning as the edge suggestion
            // above. A broken model must produce a visibly boring number, not a
            // plausible one, and the rejected value is stored so it can be blamed.
            log.warn(
                    "AI volume {} mL outside [0, {}] for pot_id={} — falling back to {} mL "
                            + "from {} (model {})",
                    ml, aiProperties.hardCeilingMl(), pot.id(), local.volumeMl(),
                    local.source(), modelVersion);
            return new ResolvedVolume(local.volumeMl(), local.source(), modelVersion, ml);
        }

        if (prediction.confidence() < aiProperties.minConfidence()) {
            // In range but unsure. Take whichever number gives less water:
            // under-watering is recoverable on the next cycle, over-watering is not.
            int conservative = Math.min(ml, local.volumeMl());
            VolumeSource source = conservative == ml ? VolumeSource.AI_MODEL : local.source();
            log.info(
                    "AI confidence {} below {} — using conservative {} mL of ({}, {} from {})",
                    prediction.confidence(), aiProperties.minConfidence(), conservative,
                    ml, local.volumeMl(), local.source());
            return new ResolvedVolume(
                    conservative,
                    source,
                    source == VolumeSource.AI_MODEL ? modelVersion : local.modelVersion(),
                    ml);
        }

        return new ResolvedVolume(ml, VolumeSource.AI_MODEL, modelVersion, ml);
    }

    /**
     * The edge sizes its dose from assumptions it holds locally. When those have
     * drifted from the pot record — a crop changed in the app, a pot re-potted —
     * the suggestion is sized for a pot that no longer exists. The suggestion is
     * still used: the edge is physically at the plant and its substrate figure is
     * arguably the more trustworthy of the two. The warning is the deliverable
     * here; a silent divergence is the failure this whole pair of wire fields
     * exists to prevent.
     *
     * <p>Only compared when both sides have a value. A pot with no crop selected
     * yet is not disagreeing with the edge, it is saying nothing, and warning on
     * every sample for it would bury the real mismatches.
     */
    private void warnOnDrift(Pot pot, IrrigationSuggestion suggestion) {
        String assumedCrop = suggestion.assumedCropCode();
        if (assumedCrop != null && pot.cropCode() != null && !assumedCrop.equals(pot.cropCode())) {
            log.warn(
                    "irrigation suggestion drift pot_id={} crop: edge assumed {} but pot is {}",
                    pot.id(), assumedCrop, pot.cropCode());
        }

        Integer assumedVolume = suggestion.assumedSubstrateVolumeMl();
        if (assumedVolume != null
                && pot.substrateVolumeMl() != null
                && !assumedVolume.equals(pot.substrateVolumeMl())) {
            log.warn(
                    "irrigation suggestion drift pot_id={} substrate volume: "
                            + "edge assumed {} mL but pot is {} mL",
                    pot.id(), assumedVolume, pot.substrateVolumeMl());
        }
    }

    /**
     * @param rejectedModelVersion which formula produced the unusable value, or null
     *                             when there was no suggestion at all
     * @param rejectedMl           the unusable value itself, preserved for the audit
     *                             trail so a misbehaving edge can be identified later
     */
    private ResolvedVolume fallback(
            Pot pot, String rejectedModelVersion, Integer rejectedMl) {
        return new ResolvedVolume(
                fallbackVolumeMl(pot.substrateVolumeMl()),
                VolumeSource.POT_SIZE_FALLBACK,
                rejectedModelVersion,
                rejectedMl);
    }

    /**
     * Fixed doses by pot substrate volume. Deliberately a small step function
     * rather than a formula: it has to stay auditable by eye and identical across
     * restarts and edge firmware versions.
     *
     * @param substrateVolumeMl substrate volume in mL, or null when unknown
     */
    public static int fallbackVolumeMl(Integer substrateVolumeMl) {
        if (substrateVolumeMl == null || substrateVolumeMl <= 0) {
            // Unknown pot gets the smallest dose. Guessing high is the mistake
            // that floods a pot, and a too-small dose is corrected on the next
            // cycle whereas standing water is not.
            return 40;
        }
        if (substrateVolumeMl <= 1000) {
            return 40;
        }
        if (substrateVolumeMl <= 3000) {
            return 80;
        }
        if (substrateVolumeMl <= 6000) {
            return 120;
        }
        return 160;
    }
}
