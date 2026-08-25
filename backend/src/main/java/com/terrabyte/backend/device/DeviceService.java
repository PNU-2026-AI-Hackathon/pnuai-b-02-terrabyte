package com.terrabyte.backend.device;

import java.time.Instant;
import java.util.List;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.CultivationSpaceRepository;
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
    private final PotRepository potRepository;

    public DeviceService(
            DeviceRepository deviceRepository,
            CultivationSpaceRepository spaceRepository,
            PotRepository potRepository) {
        this.deviceRepository = deviceRepository;
        this.spaceRepository = spaceRepository;
        this.potRepository = potRepository;
    }

    @Transactional
    public DeviceResponse register(long userId, RegisterDeviceRequest request) {
        CultivationSpace space = resolveSpace(userId, request);
        Device device = DEV_TEST_SERIAL_CODE.equals(request.serialCode())
                ? deviceRepository.createTestDevice(userId, space.id(), Instant.now())
                : claimDevice(userId, space.id(), request.serialCode());

        List<Pot> pots = potRepository.findAllByDevice(device.id());
        if (pots.isEmpty()) {
            pots = List.of(potRepository.save(device.id(), null, "화분 1"));
        }
        return DeviceResponse.from(device, space, pots);
    }

    private Device claimDevice(long userId, long spaceId, String claimCode) {
        Device device = deviceRepository.findByClaimCode(claimCode)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DEVICE_NOT_FOUND",
                        "등록되지 않은 코드예요. 숫자를 다시 확인해 주세요."));
        if (device.userId() != null
                || deviceRepository.claim(device.id(), userId, spaceId, Instant.now()) != 1) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "DEVICE_ALREADY_REGISTERED",
                    "이미 다른 계정에 연결된 기기예요.");
        }
        return deviceRepository.findByIdAndUserId(device.id(), userId)
                .orElseThrow(() -> new IllegalStateException("Registered device could not be loaded"));
    }

    public List<DeviceResponse> findAll(long userId) {
        return deviceRepository.findAllByUserId(userId).stream()
                .map(device -> response(userId, device))
                .toList();
    }

    public DeviceResponse findOne(long userId, long deviceId) {
        Device device = deviceRepository.findByIdAndUserId(deviceId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다."));
        return response(userId, device);
    }

    private CultivationSpace resolveSpace(long userId, RegisterDeviceRequest request) {
        if (request.spaceId() != null) {
            return spaceRepository.findByIdAndUserId(request.spaceId(), userId)
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.NOT_FOUND, "SPACE_NOT_FOUND", "공간을 찾을 수 없습니다."));
        }
        if (request.spaceName() == null || request.spaceName().isBlank()
                || request.spaceType() == null || request.spaceType().isBlank()
                || request.areaSquareMeters() == null) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "SPACE_INFORMATION_REQUIRED", "공간 정보를 입력해 주세요.");
        }
        return spaceRepository.save(
                userId,
                request.spaceName().trim(),
                request.spaceType().trim(),
                request.areaSquareMeters(),
                // 기기 등록 흐름에는 광원 입력이 없다. NULL 은 "모름"으로 취급된다.
                null);
    }

    private DeviceResponse response(long userId, Device device) {
        CultivationSpace space = device.spaceId() == null
                ? null
                : spaceRepository.findByIdAndUserId(device.spaceId(), userId).orElse(null);
        return DeviceResponse.from(device, space, potRepository.findAllByDevice(device.id()));
    }
}
