package com.terrabyte.backend.measurement;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Telemetry contract v2 — one gateway, N nodes.
 *
 * <p>Transport-independent by design. The MQTT subscriber and the HTTP debug
 * endpoint deserialise into this same record and hand it to the same service,
 * which is what stopped the edge and the backend from drifting apart: v1 had
 * each side bind its payload to its own transport, and six field names diverged.
 *
 * <p>Field names match {@link MeasurementMetric#field()} character for
 * character. That rule is the contract; breaking it is what caused the v1
 * mismatch.
 *
 * <p>Unlike v1 there is no {@code context} block. Site, soil type, crop type
 * and calibration version were carried on every sample and written as InfluxDB
 * tags, but the gateway is not their owner — the backend already knows them
 * from the pot and its crop selection.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TelemetryEnvelope(
        @Min(2) @Max(2) int schemaVersion,
        @NotBlank @Pattern(regexp = "telemetry\\.sample") String eventType,
        @NotBlank @Size(max = 100) String gatewayId,
        @NotBlank @Size(max = 100) String eventId,
        @NotNull Instant observedAt,
        @NotEmpty @Valid List<Node> nodes) {

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Node(
            @NotBlank @Size(max = 64) String nodeId,
            @PositiveOrZero long sequence,
            @NotNull @Valid Measurements measurements,
            @NotNull @Valid Quality quality,
            // Optional, and the only optional block on a node. The edge omits it
            // whenever it cannot compute a dose, so requiring it would refuse
            // perfectly good readings — the mistake the v1 contract made with
            // soil_moisture_raw_adc.
            @Valid IrrigationSuggestion irrigationSuggestion) {
    }

    /**
     * Air temperature and humidity are required because the environment score
     * cannot be computed without them. The soil metrics are optional: the
     * probes are physically optional on the board, and requiring
     * {@code soil_moisture_raw_adc} while the firmware never emitted it is
     * exactly how the v1 contract broke.
     */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Measurements(
            @NotNull @DecimalMin("-50.0") @DecimalMax("80.0") Double airTemperatureC,
            @NotNull @DecimalMin("0.0") @DecimalMax("100.0") Double airHumidityPct,
            @DecimalMin("0.0") @DecimalMax("200000.0") Double illuminanceLux,
            // 필수에서 선택으로 강등. 신규 노드는 lux 를 보내고 PPFD 는 서버가
            // 유도한다. 구버전 노드가 보내는 값만 레거시로 받아준다.
            @DecimalMin("0.0") @DecimalMax("5000.0") Double plantLightPpfdUmolM2S,
            @DecimalMin("-20.0") @DecimalMax("80.0") Double soilTemperatureC,
            @DecimalMin("0.0") @DecimalMax("100.0") Double soilMoisturePct,
            @PositiveOrZero Long soilMoistureRawAdc) {

        @AssertTrue(message = "illuminance_lux 또는 plant_light_ppfd_umol_m2_s 중 하나는 필요합니다")
        public boolean isLightPresent() {
            return illuminanceLux != null || plantLightPpfdUmolM2S != null;
        }

        public double soilMoisturePctOrZero() {
            return soilMoisturePct == null ? 0.0 : soilMoisturePct;
        }

        public long soilMoistureRawAdcOrZero() {
            return soilMoistureRawAdc == null ? 0L : soilMoistureRawAdc;
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Quality(
            @NotNull Boolean airSensorValid,
            @NotNull Boolean lightSensorValid,
            Boolean soilSensorValid) {

        /**
         * Absent means "no soil probe on this node", which is not the same as a
         * probe that reported a bad reading. Both are unusable for irrigation,
         * so both collapse to false here.
         */
        public boolean soilSensorValidOrFalse() {
            return Boolean.TRUE.equals(soilSensorValid);
        }
    }
}
