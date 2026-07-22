package com.terrabyte.backend.score;

import java.time.Instant;
import java.util.List;

public record EnvironmentScoreResponse(
        long deviceId,
        String cropCode,
        String cropName,
        double total,
        String grade,
        Instant measuredAt,
        String formula,
        List<Factor> factors) {

    public record Factor(
            String key,
            String label,
            String unit,
            double current,
            double optimalMin,
            double optimalMax,
            String status,
            double gap,
            double score) {
    }
}
