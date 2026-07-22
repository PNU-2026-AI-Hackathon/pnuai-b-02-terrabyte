package com.terrabyte.backend.measurement;

import java.time.Instant;

public record MeasurementPoint(Instant time, double value) {
}
