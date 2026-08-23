package com.terrabyte.backend.space;

/**
 * 공간의 주요 광원과 lux→PPFD 환산 계수.
 *
 * <p>계수는 분광 분포 가정에 기댄 문헌 근사이며 실측 보정이 아니다.
 * 측정값으로 취급하면 안 된다.
 *
 * <p>적청(red/blue) 재배용 LED는 의도적으로 빠져 있다. lux 는 광시감곡선으로
 * 가중되어 450nm(약 0.04)와 660nm(약 0.06)를 거의 세지 못하므로, 백색 LED
 * 계수를 적용하면 광량을 크게 과소평가한다. 자세한 내용은
 * docs/design/space_light_source_ppfd.md 의 "적용 범위" 절 참고.
 */
public enum LightSource {
    NATURAL_LIGHT(0.0185),
    INDOOR_LIGHTING(0.0135),
    WHITE_GROW_LED(0.0143);

    private final double ppfdPerLux;

    LightSource(double ppfdPerLux) {
        this.ppfdPerLux = ppfdPerLux;
    }

    public double ppfdPerLux() {
        return ppfdPerLux;
    }
}
