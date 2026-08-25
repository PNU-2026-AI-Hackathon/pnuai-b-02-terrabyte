package com.terrabyte.backend.ai;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Feature vector sent to {@code POST /predict/irrigation}.
 *
 * <p>The wire format is snake_case because the AI server is a Python service and
 * its Pydantic models are the contract. The explicit {@link JsonProperty} names
 * exist so that renaming a Java accessor cannot silently change the wire field
 * and turn every request into a 422.
 *
 * <p>Measurement field names are copied verbatim from the telemetry contract
 * ({@code air_temperature_c}, {@code soil_moisture_pct}, ...). Keeping one
 * spelling from sensor to model removes the train/serve skew that comes from
 * renaming a feature halfway down the pipeline.
 *
 * <p>Boxed types are intentional: a missing sensor must travel as JSON
 * {@code null} so the server can report it back in {@code imputed}. A primitive
 * would turn a missing reading into a plausible {@code 0.0}.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record IrrigationPredictionRequest(
        @JsonProperty("input_schema_version") int inputSchemaVersion,
        @JsonProperty("crop_code") String cropCode,
        @JsonProperty("substrate_volume_ml") Integer potSubstrateVolumeMl,
        @JsonProperty("soil_moisture_pct") Double soilMoisturePct,
        @JsonProperty("soil_temperature_c") Double soilTemperatureC,
        @JsonProperty("air_temperature_c") Double airTemperatureC,
        @JsonProperty("air_humidity_pct") Double airHumidityPct,
        @JsonProperty("plant_light_ppfd_umol_m2_s") Double plantLightPpfdUmolM2S,
        @JsonProperty("hours_since_last_irrigation") Double hoursSinceLastIrrigation) {
}
