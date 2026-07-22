package com.terrabyte.backend.score;

import org.springframework.stereotype.Component;

@Component
public class SuitabilityScoreCalculator {

    public double factor(double value, double zeroLow, double optimalLow, double optimalHigh, double zeroHigh) {
        double result;
        if (value <= zeroLow || value >= zeroHigh) {
            result = 0;
        } else if (value < optimalLow) {
            result = 100 * (value - zeroLow) / (optimalLow - zeroLow);
        } else if (value <= optimalHigh) {
            result = 100;
        } else {
            result = 100 * (zeroHigh - value) / (zeroHigh - optimalHigh);
        }
        return roundOneDecimal(result);
    }

    public double overall(double temperatureScore, double humidityScore, double lightScore) {
        double normalizedProduct = (temperatureScore / 100.0)
                * (humidityScore / 100.0)
                * (lightScore / 100.0);
        return roundOneDecimal(100.0 * Math.cbrt(normalizedProduct));
    }

    private double roundOneDecimal(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}
