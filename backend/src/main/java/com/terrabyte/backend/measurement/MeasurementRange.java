package com.terrabyte.backend.measurement;

import java.time.Duration;

import com.terrabyte.backend.api.ApiException;
import org.springframework.http.HttpStatus;

public enum MeasurementRange {
    ONE_HOUR("1h", Duration.ofHours(1)),
    TWENTY_FOUR_HOURS("24h", Duration.ofHours(24)),
    SEVEN_DAYS("7d", Duration.ofDays(7)),
    THIRTY_DAYS("30d", Duration.ofDays(30));

    private final String value;
    private final Duration duration;

    MeasurementRange(String value, Duration duration) {
        this.value = value;
        this.duration = duration;
    }

    public String value() {
        return value;
    }

    public Duration duration() {
        return duration;
    }

    public static MeasurementRange from(String value) {
        for (MeasurementRange range : values()) {
            if (range.value.equals(value)) {
                return range;
            }
        }
        throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "UNSUPPORTED_RANGE",
                "조회 기간은 1h, 24h, 7d, 30d 중 하나여야 합니다.");
    }
}
