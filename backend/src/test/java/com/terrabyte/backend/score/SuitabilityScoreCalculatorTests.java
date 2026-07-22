package com.terrabyte.backend.score;

import static org.assertj.core.api.Assertions.assertThat;

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
}
