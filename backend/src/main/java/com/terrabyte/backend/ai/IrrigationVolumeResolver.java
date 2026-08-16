package com.terrabyte.backend.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Decides how much water to <em>request</em>, given an optional AI suggestion.
 *
 * <p>This is the safety-critical half of the AI path. The governing idea is that
 * a model which is wrong should produce a visibly boring number, never a
 * plausible-looking one. Every rejection path therefore lands on the same fixed
 * fallback table and records why, so a broken model shows up as a run of
 * non-{@code OK} outcomes instead of quietly shifting doses.
 *
 * <p>The value returned here is still a <em>request</em>. It is re-checked by the
 * irrigation governor's per-dose ceiling and daily budget before any command is
 * issued, so this class is the first of two independent limits, not the only one.
 */
@Component
public class IrrigationVolumeResolver {

    private static final Logger log = LoggerFactory.getLogger(IrrigationVolumeResolver.class);

    private final IrrigationAiClient aiClient;
    private final AiProperties properties;

    public IrrigationVolumeResolver(IrrigationAiClient aiClient, AiProperties properties) {
        this.aiClient = aiClient;
        this.properties = properties;
    }

    /**
     * The chosen dose and the provenance the caller has to persist.
     *
     * @param volumeMl     never negative, always a usable dose
     * @param outcome      why this volume was chosen; also the metric tag
     * @param modelVersion the model behind it, or null when the fallback table
     *                     decided. Written to {@code irrigation_decision.ai_model_version}
     *                     on every decision, including the ones the AI lost
     */
    public record ResolvedVolume(int volumeMl, AiOutcome outcome, String modelVersion) {

        /** True when the model's own number was used unmodified. */
        public boolean fromModel() {
            return outcome == AiOutcome.OK;
        }
    }

    /**
     * @param potSubstrateVolumeMl substrate volume of the pot, or null when unknown
     * @param features             the feature vector for this decision
     */
    public ResolvedVolume resolveVolume(Integer potSubstrateVolumeMl, IrrigationPredictionRequest features) {
        int fallback = fallbackVolume(potSubstrateVolumeMl);
        try {
            IrrigationAiClient.Result result = aiClient.predictIrrigation(features);
            if (result.prediction() == null) {
                return new ResolvedVolume(fallback, result.outcome(), null);
            }

            IrrigationPredictionResponse prediction = result.prediction();
            String modelVersion = prediction.modelVersion();

            if (result.outcome() != AiOutcome.OK) {
                // Schema mismatch, mainly. The body parsed, but its features are not
                // the features we sent, so its number means nothing.
                return new ResolvedVolume(fallback, result.outcome(), modelVersion);
            }

            int ml = prediction.volumeMl();
            if (ml < 0 || ml > properties.hardCeilingMl()) {
                // Fall back, do NOT clamp. Clamping 99999 down to the ceiling would
                // ship a plausible-looking dose from a model that is demonstrably
                // broken, and hide the fault: the pot gets watered, the metric looks
                // normal, and nobody learns the model failed. Falling back leaves the
                // fault visible in OUT_OF_RANGE while the plant still gets water.
                log.warn("AI volume {} mL outside [0, {}] — falling back to {} mL (model {})",
                        ml, properties.hardCeilingMl(), fallback, modelVersion);
                return new ResolvedVolume(fallback, AiOutcome.OUT_OF_RANGE, modelVersion);
            }

            if (prediction.confidence() < properties.minConfidence()) {
                // The model is in range but unsure. Take whichever number gives less
                // water: under-watering is recoverable on the next cycle, over-watering
                // is not.
                int conservative = Math.min(ml, fallback);
                log.info("AI confidence {} below {} — using conservative {} mL of ({}, {})",
                        prediction.confidence(), properties.minConfidence(), conservative, ml, fallback);
                return new ResolvedVolume(conservative, AiOutcome.OK, modelVersion);
            }

            return new ResolvedVolume(ml, AiOutcome.OK, modelVersion);
        } catch (Exception e) {
            // The client already swallows its own failures; this catch covers the
            // rest of this method, because there is no failure here worth escalating
            // into "the plant does not get watered".
            log.warn("Volume resolution failed, falling back to {} mL: {}", fallback, e.getMessage());
            return new ResolvedVolume(fallback, AiOutcome.ERROR, null);
        }
    }

    /**
     * Fixed doses by pot substrate volume, from the AI fallback table. Deliberately
     * a small step function rather than a formula: it has to stay auditable by eye
     * and identical across restarts, model versions and AI outages.
     *
     * @param potSubstrateVolumeMl substrate volume in mL, or null when unknown
     */
    public static int fallbackVolume(Integer potSubstrateVolumeMl) {
        if (potSubstrateVolumeMl == null || potSubstrateVolumeMl <= 0) {
            // Unknown pot gets the smallest dose. Guessing high is the mistake that
            // floods a pot, and a too-small dose is corrected by the next cycle
            // whereas standing water is not.
            return 40;
        }
        if (potSubstrateVolumeMl <= 1000) {
            return 40;
        }
        if (potSubstrateVolumeMl <= 3000) {
            return 80;
        }
        if (potSubstrateVolumeMl <= 6000) {
            return 120;
        }
        return 160;
    }
}
