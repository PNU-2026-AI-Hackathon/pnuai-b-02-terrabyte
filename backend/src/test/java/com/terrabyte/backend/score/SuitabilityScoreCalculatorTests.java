package com.terrabyte.backend.score;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SuitabilityScoreCalculatorTests {

    private final SuitabilityScoreCalculator calculator = new SuitabilityScoreCalculator();

    @Test
    void calculatesTrapezoidFactorScores() {
        assertThat(calculator.factor(10, 10, 20, 30, 40)).isZero();
        assertThat(calculator.factor(15, 10, 20, 30, 40)).isEqualTo(50);
        assertThat(calculator.factor(25, 10, 20, 30, 40)).isEqualTo(100);
        assertThat(calculator.factor(35, 10, 20, 30, 40)).isEqualTo(50);
        assertThat(calculator.factor(40, 10, 20, 30, 40)).isZero();
    }

    @Test
    void calculatesGeometricMeanOfThreeNormalizedScores() {
        assertThat(calculator.overall(100, 100, 100)).isEqualTo(100);
        assertThat(calculator.overall(100, 100, 50)).isEqualTo(79.4);
        assertThat(calculator.overall(100, 100, 0)).isZero();
    }

    @Test
    void equalExponentsPreserveTheExistingOneThirdFormula() {
        for (int temperature = 10; temperature <= 100; temperature += 10) {
            for (int humidity = 10; humidity <= 100; humidity += 10) {
                for (int light = 10; light <= 100; light += 10) {
                    assertThat(calculator.overall(
                            temperature, humidity, light, 1, 1, 1))
                            .isEqualTo(calculator.overall(temperature, humidity, light));
                }
            }
        }
    }

    @Test
    void normalizesWeightedGeometricExponentsByTheirSum() {
        assertThat(calculator.overall(50, 100, 100, 1, 1, 1)).isEqualTo(79.4);
        assertThat(calculator.overall(50, 100, 100, 2, 1, 1)).isEqualTo(70.7);
        assertThat(calculator.overall(50, 100, 100, 20, 10, 10)).isEqualTo(70.7);
    }

    @Test
    void rejectsInvalidExponents() {
        assertThatThrownBy(() -> calculator.overall(100, 100, 100, 0, 1, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.overall(100, 100, 100, Double.NaN, 1, 1))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
