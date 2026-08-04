package com.terrabyte.backend.measurement;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MeasurementService {

    private final DeviceRepository deviceRepository;
    private final PotRepository potRepository;
    private final MeasurementStore measurementStore;
    private final InfluxProperties properties;
    private final Clock clock;

    public MeasurementService(
            DeviceRepository deviceRepository,
            PotRepository potRepository,
            MeasurementStore measurementStore,
            InfluxProperties properties,
            Clock clock) {
        this.deviceRepository = deviceRepository;
        this.potRepository = potRepository;
        this.measurementStore = measurementStore;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public TelemetryAcceptedResponse ingest(
            String suppliedDeviceKey,
            TelemetrySampleRequest request) {
        authenticateDevice(suppliedDeviceKey);
        validateObservedAt(request.observedAt());
        Device device = deviceRepository.findByHardwareId(request.deviceId())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "DEVICE_NOT_FOUND",
                        "등록되지 않은 하드웨어 기기입니다."));

        String nodeId = request.context().zoneId();
        Pot pot = potRepository.findByDeviceAndNode(device.id(), nodeId)
                .orElseGet(() -> bindNode(device, nodeId, request.observedAt()));
        potRepository.markOnline(pot.id(), request.observedAt());
        deviceRepository.markOnline(device.id(), request.observedAt());
        measurementStore.write(TelemetrySample.from(
                request, pot.id(), device.id(), nodeId, pot.cropCode()));
        return new TelemetryAcceptedResponse(
                true, device.id(), request.deviceId(), request.observedAt(), request.sequence());
    }

    public LatestMeasurementsResponse latest(long userId, long potId) {
        Pot pot = ownedPot(userId, potId);
        TelemetrySample sample = measurementStore.findLatest(pot.id())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "MEASUREMENT_NOT_FOUND",
                        "아직 수신된 측정 데이터가 없습니다."));
        return LatestMeasurementsResponse.from(pot.id(), sample);
    }

    public MeasurementSeriesResponse series(
            long userId,
            long potId,
            String metricValue,
            String rangeValue) {
        Pot pot = ownedPot(userId, potId);
        MeasurementMetric metric = MeasurementMetric.from(metricValue);
        MeasurementRange range = MeasurementRange.from(rangeValue);
        return new MeasurementSeriesResponse(
                pot.id(),
                metric.field(),
                metric.unit(),
                range.value(),
                measurementStore.findPoints(
                        pot.id(), metric, clock.instant().minus(range.duration())));
    }

    @Deprecated
    public LatestMeasurementsResponse latestForDevice(long userId, long deviceId) {
        return latest(userId, representativePot(userId, deviceId).id());
    }

    @Deprecated
    public MeasurementSeriesResponse seriesForDevice(
            long userId,
            long deviceId,
            String metric,
            String range) {
        return series(userId, representativePot(userId, deviceId).id(), metric, range);
    }

    private Pot bindNode(Device device, String nodeId, Instant observedAt) {
        var unbound = potRepository.oldestUnbound(device.id());
        if (unbound.isPresent()) {
            Pot pot = unbound.get();
            if (potRepository.bind(pot.id(), nodeId, observedAt) != 1) {
                throw new ApiException(
                        HttpStatus.CONFLICT, "POT_BINDING_CONFLICT", "화분 노드 연결이 충돌했습니다.");
            }
            return potRepository.findById(pot.id())
                    .orElseThrow(() -> new IllegalStateException("Bound pot could not be loaded"));
        }
        int nextNumber = potRepository.findAllByDevice(device.id()).size() + 1;
        return potRepository.save(device.id(), nodeId, "화분 " + nextNumber);
    }

    private Pot representativePot(long userId, long deviceId) {
        return potRepository.representative(deviceId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다."));
    }

    private Pot ownedPot(long userId, long potId) {
        return potRepository.findOwned(potId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND, "POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
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
