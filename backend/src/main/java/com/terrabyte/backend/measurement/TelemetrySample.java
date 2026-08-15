package com.terrabyte.backend.measurement;

import java.time.Instant;

/**
 * One node's measurements, resolved against the pot and gateway that own them.
 *
 * <p>{@code eventId} is the Orange Pi outbox UUID. It travels all the way into
 * InfluxDB as a field (never a tag — a value unique per sample would explode
 * series cardinality) so a stored sample can be traced back to the edge event
 * that produced it.
 */
public record TelemetrySample(
        long potId,
        long deviceId,
        String nodeId,
        String cropCode,
        String hardwareDeviceId,
        String eventId,
        Instant observedAt,
        long sequence,
        // Nullable, like every soil reading here. The probe is optional, so
        // "absent" and "0%" are different facts and only one of them is safe to
        // act on: a fabricated 0.0 reaches irrigation as a confident "bone dry",
        // which is the single reading most likely to cause over-watering.
        Double soilMoisturePct,
        Long soilMoistureRawAdc,
        double airTemperatureC,
        double airHumidityPct,
        double plantLightPpfdUmolM2S,
        Double soilTemperatureC,
        boolean soilSensorValid,
        boolean airSensorValid,
        boolean lightSensorValid) {

    public static TelemetrySample from(
            TelemetryEnvelope envelope,
            TelemetryEnvelope.Node node,
            long potId,
            long deviceId,
            String cropCode) {
        TelemetryEnvelope.Measurements measurements = node.measurements();
        TelemetryEnvelope.Quality quality = node.quality();
        return new TelemetrySample(
                potId,
                deviceId,
                node.nodeId(),
                cropCode,
                envelope.gatewayId(),
                envelope.eventId(),
                envelope.observedAt(),
                node.sequence(),
                measurements.soilMoisturePct(),
                measurements.soilMoistureRawAdc(),
                measurements.airTemperatureC(),
                measurements.airHumidityPct(),
                measurements.plantLightPpfdUmolM2S(),
                measurements.soilTemperatureC(),
                quality.soilSensorValidOrFalse(),
                quality.airSensorValid(),
                quality.lightSensorValid());
    }
}
