package com.terrabyte.backend.measurement;

import java.time.Instant;

public record TelemetrySample(
        String hardwareDeviceId,
        Instant observedAt,
        long sequence,
        String siteId,
        String zoneId,
        String soilType,
        String cropType,
        String calibrationVersion,
        double soilMoisturePct,
        long soilMoistureRawAdc,
        double airTemperatureC,
        double airHumidityPct,
        double plantLightPpfdUmolM2S,
        boolean soilSensorValid,
        boolean airSensorValid,
        boolean lightSensorValid) {

    public static TelemetrySample from(TelemetrySampleRequest request) {
        return new TelemetrySample(
                request.deviceId(),
                request.observedAt(),
                request.sequence(),
                request.context().siteId(),
                request.context().zoneId(),
                request.context().soilType(),
                request.context().cropType(),
                request.context().calibrationVersion(),
                request.measurements().soilMoisturePct(),
                request.measurements().soilMoistureRawAdc(),
                request.measurements().airTemperatureC(),
                request.measurements().airHumidityPct(),
                request.measurements().plantLightPpfdUmolM2S(),
                request.quality().soilSensorValid(),
                request.quality().airSensorValid(),
                request.quality().lightSensorValid());
    }
}
