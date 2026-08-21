package com.terrabyte.backend.score;

import java.util.List;
import java.util.Locale;
import java.util.Comparator;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import com.terrabyte.backend.measurement.MeasurementStore;
import com.terrabyte.backend.measurement.TelemetrySample;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class EnvironmentScoreService {

    private static final String EQUAL_FORMULA = "100 × (T/100 × H/100 × L/100)^(1/3)";
    private static final long SCORE_AVERAGE_WINDOW_SECONDS = 24L * 60 * 60;
    private static final double SOIL_MOISTURE_ZERO_LOW = 0;
    private static final double SOIL_MOISTURE_OPTIMAL_LOW = 30;
    private static final double SOIL_MOISTURE_OPTIMAL_HIGH = 45;
    private static final double SOIL_MOISTURE_ZERO_HIGH = 100;
    private static final double SOIL_TEMPERATURE_ZERO_LOW = 5;
    private static final double SOIL_TEMPERATURE_OPTIMAL_LOW = 18;
    private static final double SOIL_TEMPERATURE_OPTIMAL_HIGH = 25;
    private static final double SOIL_TEMPERATURE_ZERO_HIGH = 40;

    private final PotRepository potRepository;
    private final MeasurementStore measurementStore;
    private final CropScoreProfileRepository profileRepository;
    private final SuitabilityScoreCalculator calculator;

    public EnvironmentScoreService(
            PotRepository potRepository,
            MeasurementStore measurementStore,
            CropScoreProfileRepository profileRepository,
            SuitabilityScoreCalculator calculator) {
        this.potRepository = potRepository;
        this.measurementStore = measurementStore;
        this.profileRepository = profileRepository;
        this.calculator = calculator;
    }

    public EnvironmentScoreResponse latest(long userId, long potId) {
        Pot pot = potRepository.findOwned(potId, userId)
                .orElseThrow(() -> notFound("POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
        TelemetrySample sample = measurementStore.findLatest(pot.id())
                .orElseThrow(() -> notFound("MEASUREMENT_NOT_FOUND", "아직 수신된 측정 데이터가 없습니다."));
        if (pot.cropCode() == null) {
            throw notFound("CROP_NOT_SELECTED", "환경 적합도를 계산할 작물을 먼저 선택해 주세요.");
        }
        List<TelemetrySample> recentSamples = measurementStore.findSamples(
                pot.id(), Instant.now().minusSeconds(SCORE_AVERAGE_WINDOW_SECONDS));
        if (recentSamples.isEmpty()) {
            throw notFound("MEASUREMENT_NOT_FOUND", "최근 24시간 동안 수집된 측정 데이터가 없습니다.");
        }
        RecentAverages average = average(recentSamples);
        sample = new TelemetrySample(
                sample.potId(), sample.deviceId(), sample.nodeId(), sample.cropCode(),
                sample.hardwareDeviceId(), sample.eventId(), average.latestObservedAt(), sample.sequence(),
                average.soilMoisturePct(), sample.soilMoistureRawAdc(),
                average.airTemperatureC(), average.airHumidityPct(), average.plantLightPpfdUmolM2S(),
                average.soilTemperatureC(), average.hasSoil(), average.hasAir(), average.hasLight());
        if (!sample.airSensorValid() || !sample.lightSensorValid()) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "INVALID_SCORE_INPUT",
                    "온도·습도·광량 센서값이 모두 유효해야 점수를 계산할 수 있습니다.");
        }
        CropScoreProfile profile = profileRepository.findActiveByCropCode(pot.cropCode())
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
        double total = calculator.overall(
                temperature.score(),
                humidity.score(),
                light.score(),
                profile.temperatureExponent(),
                profile.humidityExponent(),
                profile.plantLightExponent());
        List<EnvironmentScoreResponse.Factor> factors = new ArrayList<>(List.of(temperature, humidity, light));
        if (sample.soilSensorValid()) {
            factors.add(factor(
                    "soilMoisture", "토양 수분", "%", sample.soilMoisturePct(),
                    SOIL_MOISTURE_ZERO_LOW, SOIL_MOISTURE_OPTIMAL_LOW,
                    SOIL_MOISTURE_OPTIMAL_HIGH, SOIL_MOISTURE_ZERO_HIGH));
            if (sample.soilTemperatureC() != null) {
                factors.add(factor(
                        "soilTemperature", "토양 온도", "℃", sample.soilTemperatureC(),
                        SOIL_TEMPERATURE_ZERO_LOW, SOIL_TEMPERATURE_OPTIMAL_LOW,
                        SOIL_TEMPERATURE_OPTIMAL_HIGH, SOIL_TEMPERATURE_ZERO_HIGH));
            }
        }

        return new EnvironmentScoreResponse(
                pot.id(),
                profile.cropCode(),
                profile.cropName(),
                total,
                grade(total),
                sample.observedAt(),
                formula(profile),
                factors);
    }

    public List<CropRecommendationResponse> cropRecommendations(long userId, long potId) {
        Pot pot = potRepository.findOwned(potId, userId)
                .orElseThrow(() -> notFound("POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
        TelemetrySample sample = measurementStore.findLatest(pot.id())
                .orElseThrow(() -> notFound("MEASUREMENT_NOT_FOUND", "아직 수신된 측정 데이터가 없습니다."));
        if (!sample.airSensorValid() || !sample.lightSensorValid()) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "INVALID_SCORE_INPUT",
                    "온도·습도·광량 센서값이 모두 유효해야 추천할 수 있습니다.");
        }

        return profileRepository.findAllActive().stream()
                .map(profile -> recommendation(profile, sample))
                .sorted(Comparator.comparingDouble(CropRecommendationResponse::total).reversed())
                .limit(3)
                .toList();
    }

    public List<DiagnosticHistoryRecord> diagnosticHistory(long userId, long potId) {
        Pot pot = potRepository.findOwned(potId, userId)
                .orElseThrow(() -> notFound("POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
        if (pot.cropCode() == null) {
            throw notFound("CROP_NOT_SELECTED", "환경 적합도를 계산할 작물을 먼저 선택해 주세요.");
        }
        CropScoreProfile profile = profileRepository.findActiveByCropCode(pot.cropCode())
                .orElseThrow(() -> notFound("CROP_PROFILE_NOT_FOUND", "작물 점수 기준을 찾을 수 없습니다."));
        List<TelemetrySample> samples = measurementStore.findSamples(pot.id(), Instant.now().minusSeconds(30L * 24 * 60 * 60));
        if (samples.isEmpty()) {
            throw notFound("MEASUREMENT_NOT_FOUND", "아직 수신된 측정 데이터가 없습니다.");
        }

        int step = Math.max(1, (int) Math.ceil(samples.size() / 14.0));
        List<DiagnosticHistoryRecord> records = new ArrayList<>();
        for (int index = 0; index < samples.size(); index += step) {
            TelemetrySample sample = samples.get(index);
            if (sample.airSensorValid() && sample.lightSensorValid()) {
                records.add(historyRecord(profile, sample));
            }
        }
        TelemetrySample latestSample = samples.get(samples.size() - 1);
        if (latestSample.airSensorValid() && latestSample.lightSensorValid()
                && (records.isEmpty() || !records.get(records.size() - 1).observedAt().equals(latestSample.observedAt()))) {
            records.add(historyRecord(profile, latestSample));
        }
        Collections.reverse(records);
        return records;
    }

    private DiagnosticHistoryRecord historyRecord(CropScoreProfile profile, TelemetrySample sample) {
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
        double total = calculator.overall(
                temperature.score(), humidity.score(), light.score(),
                profile.temperatureExponent(), profile.humidityExponent(), profile.plantLightExponent());
        String issues = List.of(temperature, humidity, light).stream()
                .filter(factor -> !factor.status().equals("OK"))
                .map(EnvironmentScoreResponse.Factor::label)
                .reduce((left, right) -> left + "·" + right)
                .orElse("주요 환경 지표 안정");
        return new DiagnosticHistoryRecord(
                sample.observedAt(),
                total,
                "측정 환경 적합도 재계산",
                issues);
    }

    private CropRecommendationResponse recommendation(CropScoreProfile profile, TelemetrySample sample) {
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
        double total = calculator.overall(
                temperature.score(), humidity.score(), light.score(),
                profile.temperatureExponent(), profile.humidityExponent(), profile.plantLightExponent());
        EnvironmentScoreResponse.Factor limitingFactor = List.of(temperature, humidity, light).stream()
                .min(Comparator.comparingDouble(EnvironmentScoreResponse.Factor::score))
                .orElse(temperature);
        String caution = limitingFactor.status().equals("OK")
                ? "현재 주요 환경 지표가 권장 범위 안에 있습니다."
                : limitingFactor.label() + "을(를) 권장 범위에 맞추면 적합도를 높일 수 있습니다.";

        return new CropRecommendationResponse(
                profile.cropCode(),
                profile.cropName(),
                total,
                "현재 측정된 온도·습도·광량을 기준으로 계산한 예상 적합도입니다.",
                caution);
    }

    /**
     * Averages only readings whose corresponding sensor was valid. A failed
     * packet therefore cannot distort the 24-hour average, while an axis with
     * no valid reading remains unavailable for score calculation.
     */
    private RecentAverages average(List<TelemetrySample> samples) {
        double airTemperatureTotal = 0;
        double airHumidityTotal = 0;
        int airCount = 0;
        double plantLightTotal = 0;
        int plantLightCount = 0;
        double soilMoistureTotal = 0;
        int soilMoistureCount = 0;
        double soilTemperatureTotal = 0;
        int soilTemperatureCount = 0;
        Instant latestObservedAt = null;

        for (TelemetrySample sample : samples) {
            if (latestObservedAt == null || sample.observedAt().isAfter(latestObservedAt)) {
                latestObservedAt = sample.observedAt();
            }
            if (sample.airSensorValid()) {
                airTemperatureTotal += sample.airTemperatureC();
                airHumidityTotal += sample.airHumidityPct();
                airCount++;
            }
            if (sample.lightSensorValid()) {
                plantLightTotal += sample.plantLightPpfdUmolM2S();
                plantLightCount++;
            }
            if (sample.soilSensorValid()) {
                soilMoistureTotal += sample.soilMoisturePct();
                soilMoistureCount++;
                if (sample.soilTemperatureC() != null) {
                    soilTemperatureTotal += sample.soilTemperatureC();
                    soilTemperatureCount++;
                }
            }
        }

        return new RecentAverages(
                divide(airTemperatureTotal, airCount),
                divide(airHumidityTotal, airCount),
                divide(plantLightTotal, plantLightCount),
                divide(soilMoistureTotal, soilMoistureCount),
                soilTemperatureCount == 0 ? null : divide(soilTemperatureTotal, soilTemperatureCount),
                airCount > 0,
                plantLightCount > 0,
                soilMoistureCount > 0,
                latestObservedAt);
    }

    private double divide(double total, int count) {
        return count == 0 ? 0 : total / count;
    }

    private String formula(CropScoreProfile profile) {
        if ("equal_geometric_v1".equals(profile.aggregationFamily())) {
            return EQUAL_FORMULA;
        }
        double exponentSum = profile.temperatureExponent()
                + profile.humidityExponent()
                + profile.plantLightExponent();
        return String.format(
                Locale.ROOT,
                "100 × (T/100)^%.6f × (H/100)^%.6f × (L/100)^%.6f",
                profile.temperatureExponent() / exponentSum,
                profile.humidityExponent() / exponentSum,
                profile.plantLightExponent() / exponentSum);
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

    private record RecentAverages(
            double airTemperatureC,
            double airHumidityPct,
            double plantLightPpfdUmolM2S,
            double soilMoisturePct,
            Double soilTemperatureC,
            boolean hasAir,
            boolean hasLight,
            boolean hasSoil,
            Instant latestObservedAt) {
    }
}
