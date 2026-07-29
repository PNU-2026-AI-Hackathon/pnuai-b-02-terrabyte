package com.terrabyte.backend.soil;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SoilProfileCatalogTests {

    private final SoilProfileCatalog catalog = new SoilProfileCatalog(new ObjectMapper());

    @ParameterizedTest
    @ValueSource(strings = {
            "basil", "peppermint", "cherry_tomato", "welsh_onion",
            "arugula", "wasabi", "lettuce", "coriander"
    })
    void findsNormalProfileForEveryKnownCropCode(String cropCode) {
        assertThat(catalog.findNormalProfile(cropCode)).isPresent();
    }

    @Test
    void welshOnionAliasesToGreenOnionProfile() {
        assertThat(catalog.findNormalProfile("welsh_onion"))
                .hasValueSatisfying(profile -> assertThat(profile.cropCode()).isEqualTo("green_onion"));
    }

    @Test
    void returnsEmptyForUnknownCropCode() {
        assertThat(catalog.findNormalProfile("unknown_crop")).isEmpty();
    }

    @Test
    void exposesTheAssumptionNoticeDisclaimer() {
        assertThat(catalog.assumptionNotice())
                .containsExactly(
                        "작물의 일반 생육 특성과 현재 환경정보에 기반한 가정값입니다.",
                        "배합비는 공식 표준이 아닌 서비스 내부 추론값입니다.");
    }
}
