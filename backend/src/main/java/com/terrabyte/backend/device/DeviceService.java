package com.terrabyte.backend.device;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.CultivationSpaceRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeviceService {

    private final DeviceRepository deviceRepository;
    private final CultivationSpaceRepository spaceRepository;

    public DeviceService(
            DeviceRepository deviceRepository,
            CultivationSpaceRepository spaceRepository) {
        this.deviceRepository = deviceRepository;
        this.spaceRepository = spaceRepository;
    }

    @Transactional
    public DeviceResponse register(long userId, RegisterDeviceRequest request) {
        if (deviceRepository.findByUserId(userId).isPresent()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "USER_ALREADY_HAS_DEVICE",
                    "이미 계정에 연결된 기기가 있습니다.");
        }

        Device device = deviceRepository.findBySerialCode(request.serialCode())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DEVICE_NOT_FOUND",
                        "등록되지 않은 코드예요. 숫자를 다시 확인해 주세요."));

        if (device.userId() != null) {
            throw deviceAlreadyRegistered();
        }

        try {
            if (deviceRepository.claim(device.id(), userId) != 1) {
                throw deviceAlreadyRegistered();
            }
        } catch (DataIntegrityViolationException exception) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "USER_ALREADY_HAS_DEVICE",
                    "이미 계정에 연결된 기기가 있습니다.");
        }

        Device registeredDevice = deviceRepository.findByUserId(userId)
                .orElseThrow(() -> new IllegalStateException("Registered device could not be loaded"));
        CultivationSpace space = spaceRepository.save(
                userId,
                registeredDevice.id(),
                request.spaceName().trim(),
                request.spaceType().trim(),
                request.areaSquareMeters());
        return DeviceResponse.from(registeredDevice, space);
    }

    private ApiException deviceAlreadyRegistered() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "DEVICE_ALREADY_REGISTERED",
                "이미 다른 계정에 연결된 기기예요.");
    }
}
