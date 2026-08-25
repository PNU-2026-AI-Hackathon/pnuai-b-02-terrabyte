package com.terrabyte.backend.ai;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A 200 body from {@code POST /predict/irrigation}.
 *
 * <p>Unknown properties are ignored so that the AI server can add diagnostic
 * fields without a lockstep backend release. Fields this backend actually acts
 * on are pinned by name instead, and a change to those shows up as a
 * {@code input_schema_version} bump rather than as a silent misread.
 *
 * @param volumeMl            the suggested dose. Not trusted until range-checked
 * @param confidence          model confidence in [0, 1]
 * @param modelVersion        recorded on every decision so a bad dose can be attributed
 *                            to a specific model artifact after the fact
 * @param inputSchemaVersion  the feature schema the loaded model expects
 * @param imputed             features the server had to fill in. A long list is a
 *                            warning sign even when confidence looks fine
 * @param latencyMs           server-side inference time, excluding network
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record IrrigationPredictionResponse(
        @JsonProperty("volume_ml") int volumeMl,
        @JsonProperty("confidence") double confidence,
        @JsonProperty("model_version") String modelVersion,
        @JsonProperty("input_schema_version") int inputSchemaVersion,
        @JsonProperty("imputed") List<String> imputed,
        @JsonProperty("latency_ms") double latencyMs) {

    public IrrigationPredictionResponse {
        // A null list would force every caller to null-check a field that only
        // exists for diagnostics.
        imputed = imputed == null ? List.of() : List.copyOf(imputed);
    }
}
