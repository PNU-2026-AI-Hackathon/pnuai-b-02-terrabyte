#pragma once

#include <Arduino.h>

enum SensorValidity : uint8_t {
  kAirTemperatureValid = 1U << 0,
  kRelativeHumidityValid = 1U << 1,
  kPpfdValid = 1U << 2,
  kSoilTemperatureValid = 1U << 3,
  kSoilMoistureValid = 1U << 4,
  kIlluminanceValid = 1U << 5,
};

constexpr uint8_t kCoreTelemetryFieldsValid =
    kAirTemperatureValid | kRelativeHumidityValid | kPpfdValid;
constexpr uint8_t kAllSensorFieldsValid =
    kCoreTelemetryFieldsValid | kSoilTemperatureValid | kSoilMoistureValid |
    kIlluminanceValid;

// Raw ADC count when no soil-moisture reading was taken. The capacitive sensor
// itself can legitimately report 0, so a sentinel outside the 10-bit range is
// needed to distinguish "not sampled" from "sampled as zero".
constexpr int16_t kSoilMoistureRawAdcAbsent = -1;

struct SensorSample {
  float airTemperatureC = NAN;
  float relativeHumidityPct = NAN;
  float ppfdUmolM2S = NAN;
  float illuminanceLux = NAN;
  float soilTemperatureC = NAN;
  float soilMoisturePct = NAN;
  // Uncalibrated ADC count. Retained even when the derived percentage is
  // rejected, so a dataset stays usable after the calibration endpoints are
  // corrected.
  int16_t soilMoistureRawAdc = kSoilMoistureRawAdcAbsent;
  uint8_t validity = 0;
};

void beginSensorAdapter();
SensorSample readSensorSample();
