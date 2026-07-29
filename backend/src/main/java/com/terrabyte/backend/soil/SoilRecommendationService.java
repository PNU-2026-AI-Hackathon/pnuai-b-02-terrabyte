package com.terrabyte.backend.soil;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class SoilRecommendationService {

    private final DeviceRepository deviceRepository;
    private final SoilProfileCatalog catalog;

    public SoilRecommendationService(DeviceRepository deviceRepository, SoilProfileCatalog catalog) {
        this.deviceRepository = deviceRepository;
        this.catalog = catalog;
    }

    public SoilRecommendationResponse latest(long userId, long deviceId) {
        Device device = deviceRepository.findByIdAndUserId(deviceId, userId)
                .orElseThrow(() -> notFound("DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다."));
        if (device.cropCode() == null) {
            throw notFound("CROP_NOT_SELECTED", "토양 배지를 추천할 작물을 먼저 선택해 주세요.");
        }
        SoilProfile profile = catalog.findNormalProfile(device.cropCode())
                .orElseThrow(() -> notFound("SOIL_PROFILE_NOT_FOUND", "선택한 작물의 토양 배지 추천 데이터를 찾을 수 없습니다."));

        return SoilRecommendationResponse.from(device.id(), device.cropCode(), profile, catalog.assumptionNotice());
    }

    private ApiException notFound(String code, String message) {
        return new ApiException(HttpStatus.NOT_FOUND, code, message);
    }
}
