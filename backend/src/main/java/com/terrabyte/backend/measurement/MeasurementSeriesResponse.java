package com.terrabyte.backend.measurement;

import java.util.List;

public record MeasurementSeriesResponse(
        long deviceId,
        String metric,
        String unit,
        String range,
        List<MeasurementPoint> points) {
}
