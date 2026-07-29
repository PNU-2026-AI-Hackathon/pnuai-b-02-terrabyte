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

    // 이 코드를 입력하면 실제 등록된 기기 코드 대신, 계정마다 전용 테스트 기기를 새로 만들어 준다.
    // 특정 계정 하나가 선점하는 공용 자원이 아니라 누구나 쓸 수 있는 온보딩 지름길로 동작해야 하기 때문.
    private static final String DEV_TEST_SERIAL_CODE = "123456";

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

        Device device = DEV_TEST_SERIAL_CODE.equals(request.serialCode())
                ? createDevTestDevice(userId)
                : claimSerialCodeDevice(userId, request.serialCode());

        CultivationSpace space = spaceRepository.save(
                userId,
                device.id(),
                request.spaceName().trim(),
                request.spaceType().trim(),
                request.areaSquareMeters());
        return DeviceResponse.from(device, space);
    }

    private Device createDevTestDevice(long userId) {
        try {
            return deviceRepository.createTestDevice(userId);
        } catch (DataIntegrityViolationException exception) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "USER_ALREADY_HAS_DEVICE",
                    "이미 계정에 연결된 기기가 있습니다.");
        }
    }

    private Device claimSerialCodeDevice(long userId, String serialCode) {
        Device device = deviceRepository.findBySerialCode(serialCode)
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

        return deviceRepository.findByUserId(userId)
                .orElseThrow(() -> new IllegalStateException("Registered device could not be loaded"));
    }

    private ApiException deviceAlreadyRegistered() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "DEVICE_ALREADY_REGISTERED",
                "이미 다른 계정에 연결된 기기예요.");
    }
}
