package com.terrabyte.backend.measurement;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface MeasurementStore {

    void write(TelemetrySample sample);

    Optional<TelemetrySample> findLatest(String hardwareDeviceId);

    List<MeasurementPoint> findPoints(
            String hardwareDeviceId,
            MeasurementMetric metric,
            Instant start);
}
