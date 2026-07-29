package com.terrabyte.backend.soil;

import java.util.List;

public record SoilRecommendationResponse(
        long deviceId,
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
        List<String> cautions,
        List<String> assumptionNotice) {

    // cropCode는 profile.cropCode()가 아니라 호출자가 넘긴 이 앱의 crop_code를 그대로 쓴다.
    // green_onion처럼 JSON 데이터셋 내부 키가 이 앱의 crop_code(welsh_onion)와 다른 크롭이 있기 때문.
    public static SoilRecommendationResponse from(
            long deviceId, String cropCode, SoilProfile profile, List<String> assumptionNotice) {
        return new SoilRecommendationResponse(
                deviceId,
                cropCode,
                profile.cropName(),
                profile.targetCondition(),
                profile.profileId(),
                profile.materials(),
                profile.mixRatio(),
                profile.mixRatioText(),
                profile.reason(),
                profile.environmentSignals(),
                profile.preChecks(),
                profile.cautions(),
                assumptionNotice);
    }
}
