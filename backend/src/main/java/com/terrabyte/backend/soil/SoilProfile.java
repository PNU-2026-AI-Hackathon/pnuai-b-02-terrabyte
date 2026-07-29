package com.terrabyte.backend.soil;

import java.util.List;

public record SoilProfile(
        String cropCode,
        String cropName,
        String targetCondition,
        String profileId,
        List<SoilMaterial> materials,
        String mixRatio,
        String mixRatioText,
        String reason,
        List<String> environmentSignals,
        List<String> preChecks,
        List<String> cautions) {
}
