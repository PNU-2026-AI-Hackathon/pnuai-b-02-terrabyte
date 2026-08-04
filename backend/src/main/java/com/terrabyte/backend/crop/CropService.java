package com.terrabyte.backend.crop;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CropService {

    private final CropRepository cropRepository;
    private final PotRepository potRepository;

    public CropService(CropRepository cropRepository, PotRepository potRepository) {
        this.cropRepository = cropRepository;
        this.potRepository = potRepository;
    }

    public List<CropResponse> findAll(String query) {
        return cropRepository.findActive(query).stream().map(CropResponse::from).toList();
    }

    @Transactional
    public CropSelectionResponse select(long userId, long potId, CropSelectionRequest request) {
        Pot pot = potRepository.findOwned(potId, userId)
                .orElseThrow(() -> notFound("POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
        String cropCode = request.cropCode().trim().toLowerCase(Locale.ROOT);
        Crop crop = cropRepository.findActiveByCode(cropCode)
                .orElseThrow(() -> notFound("CROP_NOT_FOUND", "선택할 수 있는 작물을 찾을 수 없습니다."));
        Instant selectedAt = Instant.now();
        potRepository.selectCrop(pot.id(), crop.code(), selectedAt);
        return new CropSelectionResponse(pot.id(), CropResponse.from(crop), selectedAt);
    }

    @Deprecated
    public CropSelectionResponse selectForDevice(
            long userId, long deviceId, CropSelectionRequest request) {
        Pot pot = potRepository.representative(deviceId, userId)
                .orElseThrow(() -> notFound("DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다."));
        return select(userId, pot.id(), request);
    }

    private ApiException notFound(String code, String message) {
        return new ApiException(HttpStatus.NOT_FOUND, code, message);
    }
}
