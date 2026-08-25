package com.terrabyte.backend.measurement;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;

import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.LightSource;
import org.junit.jupiter.api.Test;

class PpfdConverterTests {

    private final PpfdConverter converter = new PpfdConverter();

    private CultivationSpace space(String spaceType, LightSource lightSource) {
        return new CultivationSpace(1L, 1L, "공간", spaceType,
                new BigDecimal("10.00"), lightSource, Instant.EPOCH);
    }

    @Test
    void 사용자가_고른_광원_계수로_환산한다() {
        assertThat(converter.ppfd(1000.0, null,
                space("건물 옥상", LightSource.NATURAL_LIGHT))).isEqualTo(18.5);
    }

    @Test
    void 광원이_없으면_space_type_으로_추정한다() {
        assertThat(converter.resolve(space("지하 공간", null)))
                .isEqualTo(LightSource.INDOOR_LIGHTING);
        assertThat(converter.resolve(space("실내 유휴공간", null)))
                .isEqualTo(LightSource.INDOOR_LIGHTING);
        assertThat(converter.resolve(space("공실", null)))
                .isEqualTo(LightSource.INDOOR_LIGHTING);
        assertThat(converter.resolve(space("베란다·테라스", null)))
                .isEqualTo(LightSource.NATURAL_LIGHT);
        assertThat(converter.resolve(space("건물 옥상", null)))
                .isEqualTo(LightSource.NATURAL_LIGHT);
        assertThat(converter.resolve(space("기타", null)))
                .isEqualTo(LightSource.NATURAL_LIGHT);
    }

    @Test
    void 목록에_없는_space_type_은_자연광으로_본다() {
        assertThat(converter.resolve(space("정체불명", null)))
                .isEqualTo(LightSource.NATURAL_LIGHT);
    }

    @Test
    void lux_가_없으면_저장된_레거시_PPFD_를_쓴다() {
        assertThat(converter.ppfd(null, 230.5, space("건물 옥상", null)))
                .isEqualTo(230.5);
    }

    @Test
    void 둘_다_없으면_null_이다() {
        assertThat(converter.ppfd(null, null, space("건물 옥상", null))).isNull();
    }

    @Test
    void 근거를_구분해_알려준다() {
        CultivationSpace chosen = space("건물 옥상", LightSource.NATURAL_LIGHT);
        CultivationSpace inferred = space("건물 옥상", null);
        assertThat(converter.basis(1000.0, chosen))
                .isEqualTo(PpfdBasis.USER_SELECTED);
        assertThat(converter.basis(1000.0, inferred))
                .isEqualTo(PpfdBasis.INFERRED_FROM_SPACE_TYPE);
        assertThat(converter.basis(null, chosen))
                .isEqualTo(PpfdBasis.LEGACY_DEVICE_VALUE);
    }
}
