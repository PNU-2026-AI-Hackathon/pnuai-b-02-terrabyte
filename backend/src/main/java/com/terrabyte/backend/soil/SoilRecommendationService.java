package com.terrabyte.backend.soil;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class SoilRecommendationService {

    private final PotRepository potRepository;
    private final SoilProfileCatalog catalog;

    public SoilRecommendationService(PotRepository potRepository, SoilProfileCatalog catalog) {
        this.potRepository = potRepository;
        this.catalog = catalog;
    }

    public SoilRecommendationResponse latest(long userId, long potId) {
        Pot pot = potRepository.findOwned(potId, userId)
                .orElseThrow(() -> notFound("POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
        if (pot.cropCode() == null) {
            throw notFound("CROP_NOT_SELECTED", "토양 배지를 추천할 작물을 먼저 선택해 주세요.");
        }
        SoilProfile profile = catalog.findNormalProfile(pot.cropCode())
                .orElseThrow(() -> notFound("SOIL_PROFILE_NOT_FOUND", "선택한 작물의 토양 배지 추천 데이터를 찾을 수 없습니다."));

        return SoilRecommendationResponse.from(pot.id(), pot.cropCode(), profile, catalog.assumptionNotice());
    }

    @Deprecated
    public SoilRecommendationResponse latestForDevice(long userId, long deviceId) {
        Pot pot = potRepository.representative(deviceId, userId)
                .orElseThrow(() -> notFound("DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다."));
        return latest(userId, pot.id());
    }

    private ApiException notFound(String code, String message) {
        return new ApiException(HttpStatus.NOT_FOUND, code, message);
    }
}
