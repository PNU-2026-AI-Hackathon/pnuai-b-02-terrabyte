package com.terrabyte.backend.measurement;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

public record LatestMeasurementsResponse(
        long deviceId,
        String hardwareDeviceId,
        Instant observedAt,
        long sequence,
        Measurements measurements,
        Quality quality,
        // PPFD 가 어디서 나왔는지. 프론트가 "추정" 배지를 붙일 근거이고,
        // 유도할 수 없었을 때(광원도 저장된 PPFD 도 없을 때)만 비어 있다.
        @JsonInclude(JsonInclude.Include.NON_NULL) PpfdBasis ppfdBasis) {

    public static LatestMeasurementsResponse from(
            long deviceId,
            TelemetrySample sample,
            Double ppfd,
            PpfdBasis ppfdBasis) {
        return new LatestMeasurementsResponse(
                deviceId,
                sample.hardwareDeviceId(),
                sample.observedAt(),
                sample.sequence(),
                new Measurements(
                        sample.soilMoisturePct(),
                        sample.soilMoistureRawAdc(),
                        sample.airTemperatureC(),
                        sample.airHumidityPct(),
                        ppfd,
                        sample.soilTemperatureC()),
                new Quality(
                        sample.soilSensorValid(),
                        sample.airSensorValid(),
                        sample.lightSensorValid()),
                ppfdBasis);
    }

    public record Measurements(
            double soilMoisturePct,
            long soilMoistureRawAdc,
            double airTemperatureC,
            double airHumidityPct,
            // Nullable: PPFD is no longer stored, it is derived from the
            // measured lux and the space's light source at read time. When
            // neither a lux reading nor a legacy stored PPFD exists there is
            // no honest value to report, and 0.0 would read as darkness.
            Double plantLightPpfdUmolM2S,
            // Nullable: the soil probe is optional hardware, and an absent
            // reading must stay distinguishable from a genuine 0°C reading.
            Double soilTemperatureC) {
    }

    public record Quality(
            boolean soilSensorValid,
            boolean airSensorValid,
            boolean lightSensorValid) {
    }
}
