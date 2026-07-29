package com.terrabyte.backend.soil;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class SoilProfileCatalog {

    private static final String RESOURCE_PATH = "soil/indoor_potting_substrate_recommendations.json";

    // JSON dataset의 crop_key는 대파를 green_onion으로 표기하지만,
    // 이 프로젝트의 crop_code(DB CHECK 제약, 프론트 data.ts)는 welsh_onion을 사용한다.
    private static final Map<String, String> CROP_CODE_ALIASES = Map.of("welsh_onion", "green_onion");

    private final Map<String, Map<String, SoilProfile>> profilesByCropAndCondition;
    private final List<String> assumptionNotice;

    public SoilProfileCatalog(ObjectMapper objectMapper) {
        JsonNode root = readJson(objectMapper);
        this.profilesByCropAndCondition = parseCrops(root.path("crops"));
        this.assumptionNotice = textList(
                root.path("agent_decision_policy").path("recommendation_output_contract").path("assumption_notice"));
    }

    public Optional<SoilProfile> findNormalProfile(String cropCode) {
        return findProfile(cropCode, "NORMAL");
    }

    public Optional<SoilProfile> findProfile(String cropCode, String targetCondition) {
        String cropKey = CROP_CODE_ALIASES.getOrDefault(cropCode, cropCode);
        return Optional.ofNullable(profilesByCropAndCondition.get(cropKey))
                .map(byCondition -> byCondition.get(targetCondition));
    }

    public List<String> assumptionNotice() {
        return assumptionNotice;
    }

    private JsonNode readJson(ObjectMapper objectMapper) {
        try (InputStream stream = new ClassPathResource(RESOURCE_PATH).getInputStream()) {
            return objectMapper.readTree(stream);
        } catch (IOException e) {
            throw new IllegalStateException("토양 배지 추천 데이터를 읽지 못했습니다: " + RESOURCE_PATH, e);
        }
    }

    private Map<String, Map<String, SoilProfile>> parseCrops(JsonNode crops) {
        Map<String, Map<String, SoilProfile>> byCrop = new HashMap<>();
        for (JsonNode crop : crops) {
            String cropCode = crop.path("crop_key").asText();
            String cropName = crop.path("crop_name").asText();
            Map<String, SoilProfile> byCondition = new HashMap<>();
            for (JsonNode profile : crop.path("profiles")) {
                SoilProfile parsed = parseProfile(cropCode, cropName, profile);
                byCondition.put(parsed.targetCondition(), parsed);
            }
            byCrop.put(cropCode, byCondition);
        }
        return byCrop;
    }

    private SoilProfile parseProfile(String cropCode, String cropName, JsonNode profile) {
        List<SoilMaterial> materials = new ArrayList<>();
        for (JsonNode material : profile.path("materials")) {
            materials.add(new SoilMaterial(
                    material.path("name").asText(),
                    material.path("parts").asInt(),
                    material.path("role").asText()));
        }
        return new SoilProfile(
                cropCode,
                cropName,
                profile.path("target_condition").asText(),
                profile.path("profile_id").asText(),
                materials,
                profile.path("mix_ratio").asText(),
                profile.path("mix_ratio_text").asText(),
                profile.path("reason").asText(),
                textList(profile.path("environment_signals")),
                textList(profile.path("pre_checks")),
                textList(profile.path("cautions")));
    }

    private List<String> textList(JsonNode arrayNode) {
        List<String> values = new ArrayList<>();
        for (JsonNode item : arrayNode) {
            values.add(item.asText());
        }
        return values;
    }
}
