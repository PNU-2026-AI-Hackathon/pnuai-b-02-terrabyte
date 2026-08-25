package com.terrabyte.backend.score;

import java.util.List;
import java.util.Locale;
import java.util.Comparator;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import com.terrabyte.backend.measurement.MeasurementStore;
import com.terrabyte.backend.measurement.PpfdConverter;
import com.terrabyte.backend.measurement.TelemetrySample;
import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.CultivationSpaceRepository;
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
    private final DeviceRepository deviceRepository;
    private final CultivationSpaceRepository spaceRepository;
    private final MeasurementStore measurementStore;
    private final CropScoreProfileRepository profileRepository;
    private final SuitabilityScoreCalculator calculator;
    private final PpfdConverter ppfdConverter;

    public EnvironmentScoreService(
            PotRepository potRepository,
            DeviceRepository deviceRepository,
            CultivationSpaceRepository spaceRepository,
            MeasurementStore measurementStore,
            CropScoreProfileRepository profileRepository,
            SuitabilityScoreCalculator calculator,
            PpfdConverter ppfdConverter) {
        this.potRepository = potRepository;
        this.deviceRepository = deviceRepository;
        this.spaceRepository = spaceRepository;
        this.measurementStore = measurementStore;
        this.profileRepository = profileRepository;
        this.calculator = calculator;
        this.ppfdConverter = ppfdConverter;
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
        CultivationSpace space = spaceOf(userId, pot);
        RecentAverages average = average(recentSamples, space);
        sample = new TelemetrySample(
                sample.potId(), sample.deviceId(), sample.nodeId(), sample.cropCode(),
                sample.hardwareDeviceId(), sample.eventId(), average.latestObservedAt(), sample.sequence(),
                average.soilMoisturePct(), sample.soilMoistureRawAdc(),
                average.airTemperatureC(), average.airHumidityPct(), null, average.plantLightPpfdUmolM2S(),
                average.soilTemperatureC(), average.hasSoil(), average.hasAir(), average.hasLight(),
                sample.irrigationSuggestion());
        if (!sample.airSensorValid() || !sample.lightSensorValid()) {
            throw invalidScoreInput("온도·습도·광량 센서값이 모두 유효해야 점수를 계산할 수 있습니다.");
        }
        Double ppfd = ppfd(sample, space);
        if (ppfd == null) {
            throw invalidScoreInput("온도·습도·광량 센서값이 모두 유효해야 점수를 계산할 수 있습니다.");
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
                "plantLight", "광량", "μmol/m²/s", ppfd,
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
            throw invalidScoreInput("온도·습도·광량 센서값이 모두 유효해야 추천할 수 있습니다.");
        }
        Double ppfd = ppfd(sample, spaceOf(userId, pot));
        if (ppfd == null) {
            throw invalidScoreInput("온도·습도·광량 센서값이 모두 유효해야 추천할 수 있습니다.");
        }

        return profileRepository.findAllActive().stream()
                .map(profile -> recommendation(profile, sample, ppfd))
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

        // 광원 계수는 화분당 하나이므로 표본마다 다시 조회하지 않는다.
        CultivationSpace space = spaceOf(userId, pot);

        int step = Math.max(1, (int) Math.ceil(samples.size() / 14.0));
        List<DiagnosticHistoryRecord> records = new ArrayList<>();
        for (int index = 0; index < samples.size(); index += step) {
            TelemetrySample sample = samples.get(index);
            Double ppfd = ppfd(sample, space);
            // 여기서는 유효하지 않은 표본을 던지지 않고 건너뛴다. 이력은
            // 여러 표본을 훑는 목록이라, 광량을 못 구한 표본 하나 때문에
            // 나머지 기간까지 통째로 실패하면 안 되기 때문이다.
            if (sample.airSensorValid() && sample.lightSensorValid() && ppfd != null) {
                records.add(historyRecord(profile, sample, ppfd));
            }
        }
        TelemetrySample latestSample = samples.get(samples.size() - 1);
        Double latestPpfd = ppfd(latestSample, space);
        if (latestSample.airSensorValid() && latestSample.lightSensorValid() && latestPpfd != null
                && (records.isEmpty() || !records.get(records.size() - 1).observedAt().equals(latestSample.observedAt()))) {
            records.add(historyRecord(profile, latestSample, latestPpfd));
        }
        Collections.reverse(records);
        return records;
    }

    private DiagnosticHistoryRecord historyRecord(
            CropScoreProfile profile, TelemetrySample sample, double ppfd) {
        EnvironmentScoreResponse.Factor temperature = factor(
                "temperature", "온도", "℃", sample.airTemperatureC(),
                profile.temperatureZeroLow(), profile.temperatureOptimalLow(),
                profile.temperatureOptimalHigh(), profile.temperatureZeroHigh());
        EnvironmentScoreResponse.Factor humidity = factor(
                "humidity", "습도", "%", sample.airHumidityPct(),
                profile.humidityZeroLow(), profile.humidityOptimalLow(),
                profile.humidityOptimalHigh(), profile.humidityZeroHigh());
        EnvironmentScoreResponse.Factor light = factor(
                "plantLight", "광량", "μmol/m²/s", ppfd,
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

    private CropRecommendationResponse recommendation(
            CropScoreProfile profile, TelemetrySample sample, double ppfd) {
        EnvironmentScoreResponse.Factor temperature = factor(
                "temperature", "온도", "℃", sample.airTemperatureC(),
                profile.temperatureZeroLow(), profile.temperatureOptimalLow(),
                profile.temperatureOptimalHigh(), profile.temperatureZeroHigh());
        EnvironmentScoreResponse.Factor humidity = factor(
                "humidity", "습도", "%", sample.airHumidityPct(),
                profile.humidityZeroLow(), profile.humidityOptimalLow(),
                profile.humidityOptimalHigh(), profile.humidityZeroHigh());
        EnvironmentScoreResponse.Factor light = factor(
                "plantLight", "광량", "μmol/m²/s", ppfd,
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
    private RecentAverages average(List<TelemetrySample> samples, CultivationSpace space) {
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
                Double samplePpfd = ppfd(sample, space);
                if (samplePpfd != null) {
                    plantLightTotal += samplePpfd;
                    plantLightCount++;
                }
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

    /**
     * 저장된 것은 실측 lux 뿐이라 광량 인자는 읽을 때 공간의 광원 계수로
     * 유도한다. lux 도 저장된 레거시 PPFD 도 없으면 null 이고, 그때는
     * 센서값이 유효하지 않을 때와 같은 예외로 처리한다.
     */
    private Double ppfd(TelemetrySample sample, CultivationSpace space) {
        return space == null
                ? sample.plantLightPpfdUmolM2S()
                : ppfdConverter.ppfd(
                        sample.illuminanceLux(), sample.plantLightPpfdUmolM2S(), space);
    }

    /**
     * 화분 → 기기 → 공간. 광원은 공간의 속성이다.
     *
     * <p>공간이 삭제되면 {@code device.space_id} 가 NULL 로 끊긴다. 그때는
     * 계수를 지어내지 않고 기기가 보내온 레거시 PPFD 만 쓴다.
     */
    private CultivationSpace spaceOf(long userId, Pot pot) {
        Device device = deviceRepository.findByIdAndUserId(pot.deviceId(), userId).orElse(null);
        if (device == null || device.spaceId() == null) {
            return null;
        }
        return spaceRepository.findByIdAndUserId(device.spaceId(), userId).orElse(null);
    }

    private ApiException invalidScoreInput(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_SCORE_INPUT", message);
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
