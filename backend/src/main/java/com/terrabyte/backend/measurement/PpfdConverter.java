package com.terrabyte.backend.measurement;

import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.LightSource;
import org.springframework.stereotype.Component;

/**
 * 조도(lux)에서 PPFD 를 유도한다.
 *
 * <p>저장은 실측값인 lux 만 하고 PPFD 는 읽을 때 만든다. 그래서 광원 설정을
 * 고치면 과거 데이터까지 소급 정정된다.
 */
@Component
public class PpfdConverter {

    public LightSource resolve(CultivationSpace space) {
        if (space.lightSource() != null) {
            return space.lightSource();
        }
        // 설계 문서(docs/design/space_light_source_ppfd.md) 명시 6종:
        // 실내 조명: "실내 유휴공간", "지하 공간", "공실"
        // 자연광: "건물 옥상", "베란다·테라스", "기타"
        // space_type 은 자유 문자열(VARCHAR 50)이라 목록에 없는 값이 들어올
        // 수 있다. 기본을 자연광으로 두는 것은 펌웨어가 지금까지 써온 0.0185
        // 와 같아 기존 데이터와 연속성이 유지되기 때문이다.
        return switch (space.spaceType()) {
            case "실내 유휴공간", "지하 공간", "공실" -> LightSource.INDOOR_LIGHTING;
            case "건물 옥상", "베란다·테라스", "기타" -> LightSource.NATURAL_LIGHT;
            // 설계 문서 미명시 값(사용자가 임의로 넣은 VARCHAR)
            default -> LightSource.NATURAL_LIGHT;
        };
    }

    public Double ppfd(Double illuminanceLux, Double legacyPpfd, CultivationSpace space) {
        if (illuminanceLux != null) {
            return illuminanceLux * resolve(space).ppfdPerLux();
        }
        // 과거 포인트에는 lux 가 없다. 저장된 PPFD 를 그대로 쓴다.
        return legacyPpfd;
    }

    public PpfdBasis basis(Double illuminanceLux, CultivationSpace space) {
        if (illuminanceLux == null) {
            return PpfdBasis.LEGACY_DEVICE_VALUE;
        }
        return space.lightSource() != null
                ? PpfdBasis.USER_SELECTED
                : PpfdBasis.INFERRED_FROM_SPACE_TYPE;
    }
}
