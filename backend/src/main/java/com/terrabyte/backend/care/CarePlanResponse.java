package com.terrabyte.backend.care;

import java.time.Instant;
import java.util.List;

public record CarePlanResponse(
        Instant generatedAt,
        String provider,
        List<ManagementPriority> managementPriorities,
        List<FactorDiagnostic> factorDiagnostics,
        List<TodayTask> todayTasks,
        List<CultivationCriterion> cultivationCriteria,
        List<ImprovementAction> improvementActions,
        ExpectedOutcome expectedOutcome,
        List<RecommendedProduct> recommendedProducts) {

    public record TodayTask(String id, String priority, String title, String body, String time) {
    }

    public record ManagementPriority(String factorKey, String title) {
    }

    public record FactorDiagnostic(String factorKey, String finding, String recommendation) {
    }

    public record CultivationCriterion(String label, String title, String body) {
    }

    public record ImprovementAction(String number, String tag, String title, String body, String effect) {
    }

    public record ExpectedOutcome(String title, String body, double expectedScore, double scoreChange) {
    }

    public record RecommendedProduct(String productId, String name, String desc, int price, String reason) {
    }
}
