package com.terrabyte.backend.care;

import java.time.Instant;
import java.util.List;

import com.terrabyte.backend.measurement.LatestMeasurementsResponse;
import com.terrabyte.backend.score.DiagnosticHistoryRecord;
import com.terrabyte.backend.score.EnvironmentScoreResponse;
import com.terrabyte.backend.soil.SoilRecommendationResponse;

record CarePlanInput(
        Space space,
        Pot pot,
        LatestMeasurementsResponse measurements,
        EnvironmentScoreResponse environmentScore,
        SoilRecommendationResponse soilRecommendation,
        List<DiagnosticHistoryRecord> diagnosticHistory,
        List<CatalogProduct> catalogProducts) {

    record Space(String name, String type, String areaSquareMeters) {
    }

    record Pot(String label, String cropCode, Instant cropSelectedAt) {
    }

    record CatalogProduct(String id, String name, String description, String category) {
    }
}
