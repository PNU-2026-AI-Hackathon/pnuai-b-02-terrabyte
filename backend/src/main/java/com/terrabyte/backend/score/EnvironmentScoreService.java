package com.terrabyte.backend.score;

import java.util.List;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import com.terrabyte.backend.measurement.MeasurementStore;
import com.terrabyte.backend.measurement.TelemetrySample;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class EnvironmentScoreService {

    private static final String FORMULA = "100 × (T/100 × H/100 × L/100)^(1/3)";

    private final DeviceRepository deviceRepository;
    private final MeasurementStore measurementStore;
    private final CropScoreProfileRepository profileRepository;
    private final SuitabilityScoreCalculator calculator;

    public EnvironmentScoreService(
            DeviceRepository deviceRepository,
            MeasurementStore measurementStore,
            CropScoreProfileRepository profileRepository,
            SuitabilityScoreCalculator calculator) {
        this.deviceRepository = deviceRepository;
        this.measurementStore = measurementStore;
        this.profileRepository = profileRepository;
        this.calculator = calculator;
    }

    public EnvironmentScoreResponse latest(long userId, long deviceId) {
        Device device = deviceRepository.findByIdAndUserId(deviceId, userId)
                .orElseThrow(() -> notFound("DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다."));
        TelemetrySample sample = measurementStore.findLatest(device.hardwareId())
                .orElseThrow(() -> notFound("MEASUREMENT_NOT_FOUND", "아직 수신된 측정 데이터가 없습니다."));
        if (!sample.airSensorValid() || !sample.lightSensorValid()) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "INVALID_SCORE_INPUT",
                    "온도·습도·광량 센서값이 모두 유효해야 점수를 계산할 수 있습니다.");
        }
        CropScoreProfile profile = profileRepository.findActiveByCropCode(sample.cropType())
                .orElseThrow(() -> notFound("CROP_PROFILE_NOT_FOUND", "작물 점수 기준을 찾을 수 없습니다."));

        EnvironmentScoreResponse.Factor temperature = factor(
                "temperature", "온도", "℃", sample.airTemperatureC(),
                profile.temperatureZeroLow(), profile.temperatureOptimalLow(),
                profile.temperatureOptimalHigh(), profile.temperatureZeroHigh());
        EnvironmentScoreResponse.Factor humidity = factor(
                "humidity", "습도", "%", sample.airHumidityPct(),
                profile.humidityZeroLow(), profile.humidityOptimalLow(),
                profile.humidityOptimalHigh(), profile.humidityZeroHigh());
        EnvironmentScoreResponse.Factor light = factor(
                "plantLight", "광량", "μmol/m²/s", sample.plantLightPpfdUmolM2S(),
                profile.ppfdZeroLow(), profile.ppfdOptimalLow(),
                profile.ppfdOptimalHigh(), profile.ppfdZeroHigh());
        double total = calculator.overall(temperature.score(), humidity.score(), light.score());

        return new EnvironmentScoreResponse(
                device.id(),
                profile.cropCode(),
                profile.cropName(),
                total,
                grade(total),
                sample.observedAt(),
                FORMULA,
                List.of(temperature, humidity, light));
    }

    private EnvironmentScoreResponse.Factor factor(
            String key,
            String label,
            String unit,
            double current,
            double zeroLow,
            double optimalLow,
            double optimalHigh,
            double zeroHigh) {
        String status = current < optimalLow ? "LOW" : current > optimalHigh ? "HIGH" : "OK";
        double gap = status.equals("LOW")
                ? optimalLow - current
                : status.equals("HIGH") ? current - optimalHigh : 0;
        return new EnvironmentScoreResponse.Factor(
                key,
                label,
                unit,
                current,
                optimalLow,
                optimalHigh,
                status,
                Math.round(gap * 10.0) / 10.0,
                calculator.factor(current, zeroLow, optimalLow, optimalHigh, zeroHigh));
    }

    private String grade(double total) {
        if (total >= 80) return "GOOD";
        if (total >= 60) return "NORMAL";
        return "BAD";
    }

    private ApiException notFound(String code, String message) {
        return new ApiException(HttpStatus.NOT_FOUND, code, message);
    }
}
