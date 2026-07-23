package com.terrabyte.backend.crop;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CropService {

    private final CropRepository cropRepository;
    private final DeviceRepository deviceRepository;

    public CropService(CropRepository cropRepository, DeviceRepository deviceRepository) {
        this.cropRepository = cropRepository;
        this.deviceRepository = deviceRepository;
    }

    public List<CropResponse> findAll(String query) {
        return cropRepository.findActive(query).stream()
                .map(CropResponse::from)
                .toList();
    }

    @Transactional
    public CropSelectionResponse select(long userId, long deviceId, CropSelectionRequest request) {
        Device device = deviceRepository.findByIdAndUserId(deviceId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DEVICE_NOT_FOUND",
                        "기기를 찾을 수 없습니다."));
        String cropCode = request.cropCode().trim().toLowerCase(Locale.ROOT);
        Crop crop = cropRepository.findActiveByCode(cropCode)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "CROP_NOT_FOUND",
                        "선택할 수 있는 작물을 찾을 수 없습니다."));

        Instant selectedAt = Instant.now();
        if (deviceRepository.selectCrop(device.id(), userId, crop.code(), selectedAt) != 1) {
            throw new ApiException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다.");
        }
        return new CropSelectionResponse(device.id(), CropResponse.from(crop), selectedAt);
    }
}
