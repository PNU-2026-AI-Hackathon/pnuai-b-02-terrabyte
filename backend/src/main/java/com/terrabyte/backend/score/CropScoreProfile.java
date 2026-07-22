package com.terrabyte.backend.score;

public record CropScoreProfile(
        String cropCode,
        String cropName,
        double temperatureZeroLow,
        double temperatureOptimalLow,
        double temperatureOptimalHigh,
        double temperatureZeroHigh,
        double humidityZeroLow,
        double humidityOptimalLow,
        double humidityOptimalHigh,
        double humidityZeroHigh,
        double ppfdZeroLow,
        double ppfdOptimalLow,
        double ppfdOptimalHigh,
        double ppfdZeroHigh) {
}
