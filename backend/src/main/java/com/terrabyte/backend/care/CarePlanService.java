package com.terrabyte.backend.care;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.device.Device;
import com.terrabyte.backend.device.DeviceRepository;
import com.terrabyte.backend.measurement.LatestMeasurementsResponse;
import com.terrabyte.backend.measurement.MeasurementService;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotRepository;
import com.terrabyte.backend.score.DiagnosticHistoryRecord;
import com.terrabyte.backend.score.EnvironmentScoreResponse;
import com.terrabyte.backend.score.EnvironmentScoreService;
import com.terrabyte.backend.shop.ShopCatalogService;
import com.terrabyte.backend.shop.ShopProductResponse;
import com.terrabyte.backend.soil.SoilRecommendationResponse;
import com.terrabyte.backend.soil.SoilRecommendationService;
import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.CultivationSpaceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class CarePlanService {

    private static final Set<String> PRIORITIES = Set.of("높음", "보통", "낮음");

    private final GeminiProperties properties;
    private final GeminiCarePlanGateway gemini;
    private final PotRepository potRepository;
    private final DeviceRepository deviceRepository;
    private final CultivationSpaceRepository spaceRepository;
    private final EnvironmentScoreService scoreService;
    private final MeasurementService measurementService;
    private final SoilRecommendationService soilRecommendationService;
    private final ShopCatalogService shopCatalogService;
    private final Clock clock;
    private final Map<CacheKey, CachedPlan> cache = new ConcurrentHashMap<>();

    public CarePlanService(
            GeminiProperties properties,
            GeminiCarePlanGateway gemini,
            PotRepository potRepository,
            DeviceRepository deviceRepository,
            CultivationSpaceRepository spaceRepository,
            EnvironmentScoreService scoreService,
            MeasurementService measurementService,
            SoilRecommendationService soilRecommendationService,
            ShopCatalogService shopCatalogService,
            Clock clock) {
        this.properties = properties;
        this.gemini = gemini;
        this.potRepository = potRepository;
        this.deviceRepository = deviceRepository;
        this.spaceRepository = spaceRepository;
        this.scoreService = scoreService;
        this.measurementService = measurementService;
        this.soilRecommendationService = soilRecommendationService;
        this.shopCatalogService = shopCatalogService;
        this.clock = clock;
    }

    public CarePlanResponse generate(long userId, long potId) {
        if (!properties.configured()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_NOT_CONFIGURED",
                    "Gemini 관리 계획 기능이 아직 설정되지 않았습니다.");
        }

        CarePlanInput input = input(userId, potId);
        CacheKey key = new CacheKey(potId, input.pot().cropCode(), input.measurements().observedAt());
        Instant now = clock.instant();
        cache.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
        CachedPlan cached = cache.get(key);
        if (cached != null) return cached.plan();

        CarePlanResponse plan = validate(gemini.generate(input), input, now);
        cache.put(key, new CachedPlan(plan, now.plus(properties.cacheTtl())));
        return plan;
    }

    private CarePlanInput input(long userId, long potId) {
        Pot pot = potRepository.findOwned(potId, userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "POT_NOT_FOUND", "화분을 찾을 수 없습니다."));
        Device device = deviceRepository.findByIdAndUserId(pot.deviceId(), userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "기기를 찾을 수 없습니다."));
        CultivationSpace space = device.spaceId() == null ? null
                : spaceRepository.findByIdAndUserId(device.spaceId(), userId).orElse(null);
        EnvironmentScoreResponse score = scoreService.latest(userId, pot.id());
        LatestMeasurementsResponse measurements = measurementService.latest(userId, pot.id());
        SoilRecommendationResponse soil = soilRecommendationService.latest(userId, pot.id());
        List<DiagnosticHistoryRecord> history = scoreService.diagnosticHistory(userId, pot.id());
        List<ShopProductResponse> products = shopCatalogService.findAll(null, null, null, false).stream()
                .filter(ShopProductResponse::available)
                .toList();

        return new CarePlanInput(
                space == null ? null : new CarePlanInput.Space(
                        space.name(), space.spaceType(), space.areaSquareMeters().toPlainString()),
                new CarePlanInput.Pot(pot.label(), pot.cropCode(), pot.cropSelectedAt()),
                measurements,
                score,
                soil,
                history,
                products.stream()
                        .map(product -> new CarePlanInput.CatalogProduct(
                                product.id(), product.name(), product.desc(), product.category()))
                        .toList());
    }

    private CarePlanResponse validate(CarePlanDraft draft, CarePlanInput input, Instant generatedAt) {
        if (draft == null) throw invalid();
        List<CarePlanResponse.ManagementPriority> priorities = priorities(
                draft.managementPriorities(), input.environmentScore().factors());
        List<CarePlanResponse.FactorDiagnostic> diagnostics = diagnostics(
                draft.factorDiagnostics(), input.environmentScore().factors());
        List<CarePlanResponse.TodayTask> tasks = tasks(draft.todayTasks());
        List<CarePlanResponse.CultivationCriterion> criteria = criteria(draft.cultivationCriteria());
        List<CarePlanResponse.ImprovementAction> improvements = improvements(draft.improvementActions());
        CarePlanResponse.ExpectedOutcome outcome = outcome(draft.expectedOutcome(), input.environmentScore().total());
        List<CarePlanResponse.RecommendedProduct> products = products(draft.recommendedProducts(), input.catalogProducts());
        return new CarePlanResponse(
                generatedAt, "GEMINI", priorities, diagnostics, tasks, criteria, improvements, outcome, products);
    }

    private List<CarePlanResponse.ManagementPriority> priorities(
            List<CarePlanDraft.Priority> drafts,
            List<EnvironmentScoreResponse.Factor> factors) {
        if (drafts == null || drafts.isEmpty() || drafts.size() > 3) throw invalid();
        Set<String> factorKeys = factors.stream().map(EnvironmentScoreResponse.Factor::key).collect(java.util.stream.Collectors.toSet());
        Set<String> seen = new HashSet<>();
        List<CarePlanResponse.ManagementPriority> result = new ArrayList<>();
        for (CarePlanDraft.Priority priority : drafts) {
            if (priority == null || priority.factorKey() == null
                    || !factorKeys.contains(priority.factorKey()) || !seen.add(priority.factorKey())) throw invalid();
            result.add(new CarePlanResponse.ManagementPriority(priority.factorKey(), text(priority.title(), 100)));
        }
        return result;
    }

    private List<CarePlanResponse.FactorDiagnostic> diagnostics(
            List<CarePlanDraft.Factor> drafts,
            List<EnvironmentScoreResponse.Factor> factors) {
        if (drafts == null || drafts.size() != factors.size()) throw invalid();
        Set<String> factorKeys = factors.stream().map(EnvironmentScoreResponse.Factor::key).collect(java.util.stream.Collectors.toSet());
        Set<String> seen = new HashSet<>();
        List<CarePlanResponse.FactorDiagnostic> result = new ArrayList<>();
        for (CarePlanDraft.Factor diagnostic : drafts) {
            if (diagnostic == null || diagnostic.factorKey() == null
                    || !factorKeys.contains(diagnostic.factorKey()) || !seen.add(diagnostic.factorKey())) throw invalid();
            result.add(new CarePlanResponse.FactorDiagnostic(
                    diagnostic.factorKey(), text(diagnostic.finding(), 360), text(diagnostic.recommendation(), 360)));
        }
        return result;
    }

    private List<CarePlanResponse.TodayTask> tasks(List<CarePlanDraft.Task> drafts) {
        if (drafts == null || drafts.size() < 2 || drafts.size() > 3) throw invalid();
        List<CarePlanResponse.TodayTask> result = new ArrayList<>();
        for (int index = 0; index < drafts.size(); index++) {
            CarePlanDraft.Task task = drafts.get(index);
            if (task == null || !PRIORITIES.contains(task.priority())) throw invalid();
            result.add(new CarePlanResponse.TodayTask(
                    "ai-task-" + (index + 1), task.priority(), text(task.title(), 80),
                    text(task.body(), 360), text(task.time(), 40)));
        }
        return result;
    }

    private List<CarePlanResponse.CultivationCriterion> criteria(List<CarePlanDraft.Criterion> drafts) {
        if (drafts == null || drafts.size() != 3) throw invalid();
        List<CarePlanResponse.CultivationCriterion> result = new ArrayList<>();
        for (CarePlanDraft.Criterion criterion : drafts) {
            if (criterion == null) throw invalid();
            result.add(new CarePlanResponse.CultivationCriterion(
                    text(criterion.label(), 40), text(criterion.title(), 100), text(criterion.body(), 300)));
        }
        return result;
    }

    private List<CarePlanResponse.ImprovementAction> improvements(List<CarePlanDraft.Improvement> drafts) {
        if (drafts == null || drafts.size() < 2 || drafts.size() > 3) throw invalid();
        List<CarePlanResponse.ImprovementAction> result = new ArrayList<>();
        for (int index = 0; index < drafts.size(); index++) {
            CarePlanDraft.Improvement improvement = drafts.get(index);
            if (improvement == null) throw invalid();
            result.add(new CarePlanResponse.ImprovementAction(
                    String.format("%02d", index + 1), text(improvement.tag(), 40), text(improvement.title(), 100),
                    text(improvement.body(), 360), text(improvement.effect(), 100)));
        }
        return result;
    }

    private CarePlanResponse.ExpectedOutcome outcome(CarePlanDraft.Outcome draft, double currentScore) {
        if (draft == null || draft.expectedScore() == null
                || draft.expectedScore() < 0 || draft.expectedScore() > 100) throw invalid();
        double expected = round(draft.expectedScore());
        return new CarePlanResponse.ExpectedOutcome(
                text(draft.title(), 100), text(draft.body(), 360), expected, round(expected - currentScore));
    }

    private List<CarePlanResponse.RecommendedProduct> products(
            List<CarePlanDraft.Product> drafts,
            List<CarePlanInput.CatalogProduct> catalog) {
        if (drafts == null || drafts.size() > 3) throw invalid();
        Map<String, CarePlanInput.CatalogProduct> byId = new HashMap<>();
        for (CarePlanInput.CatalogProduct product : catalog) byId.put(product.id(), product);
        List<CarePlanResponse.RecommendedProduct> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (CarePlanDraft.Product draft : drafts) {
            if (draft == null || draft.productId() == null || !seen.add(draft.productId())) throw invalid();
            CarePlanInput.CatalogProduct product = byId.get(draft.productId());
            if (product == null) throw invalid();
            ShopProductResponse currentProduct = shopCatalogService.findById(product.id());
            result.add(new CarePlanResponse.RecommendedProduct(
                    currentProduct.id(), currentProduct.name(), currentProduct.desc(),
                    currentProduct.salePrice(), text(draft.reason(), 240)));
        }
        return result;
    }

    private String text(String value, int maxLength) {
        if (value == null) throw invalid();
        String normalized = value.trim();
        if (normalized.isBlank() || normalized.length() > maxLength) throw invalid();
        return normalized;
    }

    private double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "AI_INVALID_RESPONSE", "Gemini가 유효한 관리 계획을 반환하지 않았습니다.");
    }

    private record CacheKey(long potId, String cropCode, Instant observedAt) {
    }

    private record CachedPlan(CarePlanResponse plan, Instant expiresAt) {
    }
}
