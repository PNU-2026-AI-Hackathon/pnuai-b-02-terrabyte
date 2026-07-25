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
        return overall(temperatureScore, humidityScore, lightScore, 1.0, 1.0, 1.0);
    }

    public double overall(
            double temperatureScore,
            double humidityScore,
            double lightScore,
            double temperatureExponent,
            double humidityExponent,
            double lightExponent) {
        validateExponent(temperatureExponent, "temperatureExponent");
        validateExponent(humidityExponent, "humidityExponent");
        validateExponent(lightExponent, "lightExponent");
        if (temperatureScore <= 0 || humidityScore <= 0 || lightScore <= 0) {
            return 0;
        }

        double exponentSum = temperatureExponent + humidityExponent + lightExponent;
        double normalizedLogScore =
                temperatureExponent / exponentSum * Math.log(temperatureScore / 100.0)
                + humidityExponent / exponentSum * Math.log(humidityScore / 100.0)
                + lightExponent / exponentSum * Math.log(lightScore / 100.0);
        return roundOneDecimal(100.0 * Math.exp(normalizedLogScore));
    }

    private void validateExponent(double exponent, String name) {
        if (!Double.isFinite(exponent) || exponent <= 0) {
            throw new IllegalArgumentException(name + " must be finite and greater than zero");
        }
    }

    private double roundOneDecimal(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}
