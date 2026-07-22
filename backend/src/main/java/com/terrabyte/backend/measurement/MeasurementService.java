package com.terrabyte.backend.measurement;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class MeasurementService {

    private final DeviceRepository deviceRepository;
    private final MeasurementStore measurementStore;
    private final InfluxProperties properties;
    private final Clock clock;

    public MeasurementService(
            DeviceRepository deviceRepository,
            MeasurementStore measurementStore,
            InfluxProperties properties,
            Clock clock) {
        this.deviceRepository = deviceRepository;
        this.measurementStore = measurementStore;
        this.properties = properties;
        this.clock = clock;
    }

    public TelemetryAcceptedResponse ingest(String suppliedDeviceKey, TelemetrySampleRequest request) {
        authenticateDevice(suppliedDeviceKey);
        validateObservedAt(request.observedAt());

        Device device = deviceRepository.findByHardwareId(request.deviceId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DEVICE_NOT_FOUND",
                        "등록되지 않은 하드웨어 기기입니다."));

        TelemetrySample sample = TelemetrySample.from(request);
        measurementStore.write(sample);
        deviceRepository.markOnline(device.id(), request.observedAt());

        return new TelemetryAcceptedResponse(
                true,
                device.id(),
                request.deviceId(),
                request.observedAt(),
                request.sequence());
    }

    public LatestMeasurementsResponse latest(long userId, long deviceId) {
        Device device = ownedDevice(userId, deviceId);
        TelemetrySample sample = measurementStore.findLatest(device.hardwareId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "MEASUREMENT_NOT_FOUND",
                        "아직 수신된 측정 데이터가 없습니다."));
        return LatestMeasurementsResponse.from(device.id(), sample);
    }

    public MeasurementSeriesResponse series(
            long userId,
            long deviceId,
            String metricValue,
            String rangeValue) {
        Device device = ownedDevice(userId, deviceId);
        MeasurementMetric metric = MeasurementMetric.from(metricValue);
        MeasurementRange range = MeasurementRange.from(rangeValue);
        Instant start = clock.instant().minus(range.duration());
        return new MeasurementSeriesResponse(
                device.id(),
                metric.field(),
                metric.unit(),
                range.value(),
                measurementStore.findPoints(device.hardwareId(), metric, start));
    }

    private Device ownedDevice(long userId, long deviceId) {
        Device device = deviceRepository.findByIdAndUserId(deviceId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DEVICE_NOT_FOUND",
                        "기기를 찾을 수 없습니다."));
        if (device.hardwareId() == null || device.hardwareId().isBlank()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "HARDWARE_ID_NOT_CONFIGURED",
                    "기기의 하드웨어 식별자가 설정되지 않았습니다.");
        }
        return device;
    }

    private void authenticateDevice(String suppliedDeviceKey) {
        byte[] expected = properties.deviceKey().getBytes(StandardCharsets.UTF_8);
        byte[] actual = suppliedDeviceKey == null
                ? new byte[0]
                : suppliedDeviceKey.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "INVALID_DEVICE_KEY",
                    "유효하지 않은 기기 인증 키입니다.");
        }
    }

    private void validateObservedAt(Instant observedAt) {
        if (observedAt.isAfter(clock.instant().plusSeconds(300))) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "OBSERVED_AT_IN_FUTURE",
                    "측정 시각이 현재 시각보다 너무 앞서 있습니다.");
        }
    }
}
