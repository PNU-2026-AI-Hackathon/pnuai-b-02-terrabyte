package com.terrabyte.backend.measurement;

import java.time.Instant;

public record LatestMeasurementsResponse(
        long deviceId,
        String hardwareDeviceId,
        Instant observedAt,
        long sequence,
        Measurements measurements,
        Quality quality) {

    public static LatestMeasurementsResponse from(long deviceId, TelemetrySample sample) {
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
                        sample.plantLightPpfdUmolM2S(),
                        sample.soilTemperatureC()),
                new Quality(
                        sample.soilSensorValid(),
                        sample.airSensorValid(),
                        sample.lightSensorValid()));
    }

    public record Measurements(
            double soilMoisturePct,
            long soilMoistureRawAdc,
            double airTemperatureC,
            double airHumidityPct,
            double plantLightPpfdUmolM2S,
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
