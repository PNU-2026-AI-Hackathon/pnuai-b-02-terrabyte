#include "../include/SensorAdapter.h"

#include <math.h>

#include "../include/TelemetryConfig.h"

#if !TB_MOCK_SENSOR_ENABLED && TB_DHT22_ENABLED
#include <DHT.h>
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_GY30_ENABLED
#include <Wire.h>
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_TEMPERATURE_ENABLED
#include <DallasTemperature.h>
#include <OneWire.h>
#endif

namespace {

#if !TB_MOCK_SENSOR_ENABLED && TB_DHT22_ENABLED
DHT dht(TB_DHT22_PIN, DHT22);
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_GY30_ENABLED
constexpr uint8_t kGy30PowerOn = 0x01;
constexpr uint8_t kGy30Reset = 0x07;
constexpr uint8_t kGy30ContinuousHighResolutionMode = 0x10;
constexpr float kGy30HighResolutionDivisor = 1.2f;

#if TB_GY30_PPFD_CALIBRATION_ENABLED
static_assert(TB_PPFD_CALIBRATED_MIN_LUX < TB_PPFD_CALIBRATED_MAX_LUX,
              "PPFD calibrated lux minimum must be below the maximum");
#endif

bool gy30Ready = false;

bool sendGy30Command(const uint8_t command) {
  Wire.beginTransmission(TB_GY30_I2C_ADDRESS);
  Wire.write(command);
  return Wire.endTransmission() == 0;
}

bool initializeGy30() {
  return sendGy30Command(kGy30PowerOn) && sendGy30Command(kGy30Reset) &&
         sendGy30Command(kGy30ContinuousHighResolutionMode);
}

bool readGy30Lux(float& illuminanceLux) {
  if (!gy30Ready) {
    gy30Ready = initializeGy30();
  }
  if (!gy30Ready) {
    return false;
  }

  const size_t received =
      Wire.requestFrom(static_cast<int>(TB_GY30_I2C_ADDRESS), 2);
  if (received != 2 || Wire.available() < 2) {
    while (Wire.available() > 0) {
      Wire.read();
    }
    gy30Ready = false;
    return false;
  }

  const uint16_t rawIlluminance =
      (static_cast<uint16_t>(Wire.read()) << 8) |
      static_cast<uint16_t>(Wire.read());
  illuminanceLux =
      static_cast<float>(rawIlluminance) / kGy30HighResolutionDivisor;
  return isfinite(illuminanceLux);
}
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_TEMPERATURE_ENABLED
OneWire soilTemperatureBus(TB_SOIL_TEMPERATURE_PIN);
DallasTemperature soilTemperatureSensors(&soilTemperatureBus);
#endif

#if TB_MOCK_SENSOR_ENABLED
constexpr uint8_t kMockHalfCycleSteps = 8;

uint8_t mockTriangleStep() {
  constexpr uint8_t kMockCycleSteps = kMockHalfCycleSteps * 2;
  const uint32_t sampleStep = millis() / TB_TELEMETRY_INTERVAL_MS;
  const uint8_t cycleStep = sampleStep % kMockCycleSteps;
  return cycleStep <= kMockHalfCycleSteps
             ? cycleStep
             : static_cast<uint8_t>(kMockCycleSteps - cycleStep);
}
#endif

}  // namespace

void beginSensorAdapter() {
#if !TB_MOCK_SENSOR_ENABLED && TB_DHT22_ENABLED
  dht.begin();
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_GY30_ENABLED
  Wire.begin();
  gy30Ready = initializeGy30();
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_TEMPERATURE_ENABLED
  soilTemperatureSensors.begin();
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_MOISTURE_ENABLED
  pinMode(TB_SOIL_MOISTURE_ADC_PIN, INPUT);
#endif
}

SensorSample readSensorSample() {
  SensorSample sample;

#if TB_MOCK_SENSOR_ENABLED
  // A bounded triangle wave is deterministic across runs and changes once per
  // scheduled sample. These values exist only for explicit E2E mock builds.
  const float step = static_cast<float>(mockTriangleStep());
  sample.airTemperatureC = 22.0f + (step * 0.15f);
  sample.relativeHumidityPct = 55.0f + (step * 0.30f);
  sample.ppfdUmolM2S = 360.0f + (step * 8.0f);
  sample.illuminanceLux = 12000.0f + (step * 250.0f);
  sample.soilTemperatureC = 18.0f + (step * 0.10f);
  sample.soilMoisturePct = 48.0f + (step * 0.50f);
  sample.validity = kAllSensorFieldsValid;
  return sample;
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_DHT22_ENABLED
  const float humidity = dht.readHumidity();
  const float temperature = dht.readTemperature();

  if (isfinite(temperature)) {
    sample.airTemperatureC = temperature;
    sample.validity |= kAirTemperatureValid;
  }
  if (isfinite(humidity)) {
    sample.relativeHumidityPct = humidity;
    sample.validity |= kRelativeHumidityValid;
  }
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_GY30_ENABLED
  float illuminanceLux = NAN;
  if (readGy30Lux(illuminanceLux)) {
    sample.illuminanceLux = illuminanceLux;
    sample.validity |= kIlluminanceValid;

#if TB_GY30_PPFD_CALIBRATION_ENABLED
    if (illuminanceLux >= TB_PPFD_CALIBRATED_MIN_LUX &&
        illuminanceLux <= TB_PPFD_CALIBRATED_MAX_LUX) {
      const float ppfd =
          (illuminanceLux * TB_PPFD_PER_LUX) + TB_PPFD_OFFSET;
      if (isfinite(ppfd)) {
        sample.ppfdUmolM2S = ppfd;
        sample.validity |= kPpfdValid;
      }
    }
#endif
  }
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_TEMPERATURE_ENABLED
  soilTemperatureSensors.requestTemperatures();
  const float soilTemperature = soilTemperatureSensors.getTempCByIndex(0);
  if (soilTemperature != DEVICE_DISCONNECTED_C && isfinite(soilTemperature)) {
    sample.soilTemperatureC = soilTemperature;
    sample.validity |= kSoilTemperatureValid;
  }
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_MOISTURE_ENABLED
  const int rawSoilMoisture = analogRead(TB_SOIL_MOISTURE_ADC_PIN);
  const int dryAdc = TB_SOIL_MOISTURE_DRY_ADC;
  const int wetAdc = TB_SOIL_MOISTURE_WET_ADC;
  const int minimumAdc = dryAdc < wetAdc ? dryAdc : wetAdc;
  const int maximumAdc = dryAdc > wetAdc ? dryAdc : wetAdc;

  if (rawSoilMoisture >= minimumAdc && rawSoilMoisture <= maximumAdc) {
    sample.soilMoisturePct =
        (static_cast<float>(rawSoilMoisture - dryAdc) * 100.0f) /
        static_cast<float>(wetAdc - dryAdc);
    if (isfinite(sample.soilMoisturePct)) {
      sample.validity |= kSoilMoistureValid;
    }
  }
#endif

  return sample;
}
