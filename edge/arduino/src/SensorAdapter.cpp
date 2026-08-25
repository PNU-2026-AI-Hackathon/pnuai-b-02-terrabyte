#include "../include/SensorAdapter.h"

#include <math.h>

#include "../include/TelemetryConfig.h"

#if !TB_MOCK_SENSOR_ENABLED && TB_DHT22_ENABLED
#include <DHT.h>
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_TSL2591_ENABLED
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

#if !TB_MOCK_SENSOR_ENABLED && TB_TSL2591_ENABLED
constexpr uint8_t kTsl2591CommandBit = 0xA0;
constexpr uint8_t kTsl2591EnableRegister = 0x00;
constexpr uint8_t kTsl2591ControlRegister = 0x01;
constexpr uint8_t kTsl2591IdRegister = 0x12;
constexpr uint8_t kTsl2591StatusRegister = 0x13;
constexpr uint8_t kTsl2591Channel0DataLowRegister = 0x14;
constexpr uint8_t kTsl2591Channel1DataLowRegister = 0x16;
constexpr uint8_t kTsl2591ExpectedId = 0x50;
constexpr uint8_t kTsl2591PowerAndAlsEnable = 0x03;
constexpr uint8_t kTsl2591PowerOnly = 0x01;
constexpr uint8_t kTsl2591DataValid = 0x01;
constexpr uint8_t kTsl2591MaximumAttempts = 3;
// Long enough for a byte at 100 kHz with margin, short enough that a stuck bus
// costs one sample instead of the whole run.
constexpr uint32_t kI2cTimeoutUs = 25000UL;
constexpr uint16_t kTsl2591SaturationCount =
    TB_TSL2591_INTEGRATION_MS == 100 ? 36863U : 65535U;
constexpr uint8_t kTsl2591IntegrationBits =
    (TB_TSL2591_INTEGRATION_MS / 100) - 1;

#if TB_PPFD_CALIBRATION_ENABLED
static_assert(TB_PPFD_CALIBRATED_MIN_LUX < TB_PPFD_CALIBRATED_MAX_LUX,
              "PPFD calibrated lux minimum must be below the maximum");
#endif

#if TB_TSL2591_GAIN == 1
uint8_t tsl2591GainIndex = 0;
#elif TB_TSL2591_GAIN == 25
uint8_t tsl2591GainIndex = 1;
#elif TB_TSL2591_GAIN == 428
uint8_t tsl2591GainIndex = 2;
#else
uint8_t tsl2591GainIndex = 3;
#endif

bool tsl2591Ready = false;

uint16_t tsl2591GainValue() {
  switch (tsl2591GainIndex) {
    case 0:
      return 1;
    case 1:
      return 25;
    case 2:
      return 428;
    default:
      return 9876;
  }
}

uint8_t tsl2591ControlValue() {
  return static_cast<uint8_t>((tsl2591GainIndex << 4) |
                              kTsl2591IntegrationBits);
}

bool writeTsl2591Register(const uint8_t address, const uint8_t value) {
  Wire.beginTransmission(TB_TSL2591_I2C_ADDRESS);
  Wire.write(kTsl2591CommandBit | address);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readTsl2591Register(const uint8_t address, uint8_t& value) {
  Wire.beginTransmission(TB_TSL2591_I2C_ADDRESS);
  Wire.write(kTsl2591CommandBit | address);
  if (Wire.endTransmission() != 0) {
    return false;
  }

  const size_t received =
      Wire.requestFrom(static_cast<int>(TB_TSL2591_I2C_ADDRESS), 1);
  if (received != 1 || Wire.available() < 1) {
    while (Wire.available() > 0) {
      Wire.read();
    }
    return false;
  }

  value = static_cast<uint8_t>(Wire.read());
  return true;
}

bool readTsl2591Register16(const uint8_t address, uint16_t& value) {
  Wire.beginTransmission(TB_TSL2591_I2C_ADDRESS);
  Wire.write(kTsl2591CommandBit | address);
  if (Wire.endTransmission() != 0) {
    return false;
  }

  const size_t received =
      Wire.requestFrom(static_cast<int>(TB_TSL2591_I2C_ADDRESS), 2);
  if (received != 2 || Wire.available() < 2) {
    while (Wire.available() > 0) {
      Wire.read();
    }
    return false;
  }

  const uint8_t lowByte = static_cast<uint8_t>(Wire.read());
  const uint8_t highByte = static_cast<uint8_t>(Wire.read());
  value = static_cast<uint16_t>(lowByte) |
          (static_cast<uint16_t>(highByte) << 8);
  return true;
}

bool initializeTsl2591() {
  uint8_t id = 0;
  return readTsl2591Register(kTsl2591IdRegister, id) &&
         id == kTsl2591ExpectedId &&
         writeTsl2591Register(kTsl2591ControlRegister,
                              tsl2591ControlValue()) &&
         writeTsl2591Register(kTsl2591EnableRegister,
                              kTsl2591PowerAndAlsEnable);
}

bool waitForTsl2591Data() {
  const uint32_t startedAtMs = millis();
  const uint32_t timeoutMs = TB_TSL2591_INTEGRATION_MS + 100UL;
  while ((millis() - startedAtMs) <= timeoutMs) {
    uint8_t status = 0;
    if (!readTsl2591Register(kTsl2591StatusRegister, status)) {
      return false;
    }
    if (status & kTsl2591DataValid) {
      return true;
    }
    delay(1);
  }
  return false;
}

bool readTsl2591Channels(uint16_t& channel0, uint16_t& channel1) {
  return waitForTsl2591Data() &&
         readTsl2591Register16(kTsl2591Channel0DataLowRegister, channel0) &&
         readTsl2591Register16(kTsl2591Channel1DataLowRegister, channel1);
}

#if TB_TSL2591_AUTO_GAIN_ENABLED
bool setTsl2591Gain(const uint8_t gainIndex) {
  const uint8_t previousGainIndex = tsl2591GainIndex;
  tsl2591GainIndex = gainIndex;
  // STATUS.AVALID stays set once AEN has been asserted, so it cannot signal
  // that a cycle at the new gain has finished. Dropping AEN clears it and
  // restarts integration, which makes the following wait block for a full
  // cycle at the new gain instead of latching one that straddled the change.
  if (!writeTsl2591Register(kTsl2591EnableRegister, kTsl2591PowerOnly) ||
      !writeTsl2591Register(kTsl2591ControlRegister, tsl2591ControlValue()) ||
      !writeTsl2591Register(kTsl2591EnableRegister,
                            kTsl2591PowerAndAlsEnable)) {
    tsl2591GainIndex = previousGainIndex;
    return false;
  }
  return true;
}
#endif

bool readTsl2591Lux(float& illuminanceLux) {
  if (!tsl2591Ready) {
    tsl2591Ready = initializeTsl2591();
  }
  if (!tsl2591Ready) {
    return false;
  }

  for (uint8_t attempt = 0; attempt < kTsl2591MaximumAttempts; ++attempt) {
    uint16_t channel0 = 0;
    uint16_t channel1 = 0;
    if (!readTsl2591Channels(channel0, channel1)) {
      tsl2591Ready = false;
      return false;
    }

    const bool saturated = channel0 >= kTsl2591SaturationCount ||
                           channel1 >= kTsl2591SaturationCount;
    if (saturated) {
#if TB_TSL2591_AUTO_GAIN_ENABLED
      if (tsl2591GainIndex > 0 &&
          attempt + 1 < kTsl2591MaximumAttempts) {
        if (!setTsl2591Gain(tsl2591GainIndex - 1)) {
          tsl2591Ready = false;
          return false;
        }
        continue;
      }
#endif
      tsl2591Ready = false;
      return false;
    }

#if TB_TSL2591_AUTO_GAIN_ENABLED
    if (channel0 < 100 && tsl2591GainIndex < 3 &&
        attempt + 1 < kTsl2591MaximumAttempts) {
      if (!setTsl2591Gain(tsl2591GainIndex + 1)) {
        tsl2591Ready = false;
        return false;
      }
      continue;
    }
#endif

    if (channel0 == 0) {
      illuminanceLux = 0.0f;
      return true;
    }

    const float channel0Float = static_cast<float>(channel0);
    const float channel1Float = static_cast<float>(channel1);
    const float countsPerLux =
        (static_cast<float>(TB_TSL2591_INTEGRATION_MS) *
         static_cast<float>(tsl2591GainValue())) /
        408.0f;
    const float lux =
        (channel0Float - channel1Float) *
        (1.0f - (channel1Float / channel0Float)) / countsPerLux;
    if (!isfinite(lux)) {
      tsl2591Ready = false;
      return false;
    }
    illuminanceLux = lux;
    return true;
  }

  tsl2591Ready = false;
  return false;
}
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_TEMPERATURE_ENABLED
OneWire soilTemperatureBus(TB_SOIL_TEMPERATURE_PIN);
DallasTemperature soilTemperatureSensors(&soilTemperatureBus);
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_MOISTURE_ENABLED
constexpr uint8_t kSoilMoistureSampleCount = 10;

// The first conversion after selecting an input carries residue from the
// sample-and-hold capacitor, and a capacitive probe picks up enough supply
// noise that single counts swing by roughly 15 - wide enough to straddle a
// calibration endpoint and flap the reading in and out of the valid band.
// Discarding one conversion and averaging a short burst is what makes an
// endpoint mean anything.
uint16_t readSoilMoistureRawAdc() {
  (void)analogRead(TB_SOIL_MOISTURE_ADC_PIN);

  uint16_t sum = 0;
  for (uint8_t sample = 0; sample < kSoilMoistureSampleCount; ++sample) {
    sum += static_cast<uint16_t>(analogRead(TB_SOIL_MOISTURE_ADC_PIN));
    delay(2);
  }
  return sum / kSoilMoistureSampleCount;
}
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

#if !TB_MOCK_SENSOR_ENABLED && TB_TSL2591_ENABLED
  Wire.begin();
  // A sensor that holds SDA or SCL low blocks AVR Wire forever by default,
  // which previously hung this node in setup() before it could report anything.
  // Time out instead and reset the bus so a bad sensor degrades to a failed
  // reading rather than a dead device.
  Wire.setWireTimeout(kI2cTimeoutUs, true);
  tsl2591Ready = initializeTsl2591();
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
  sample.soilMoistureRawAdc = static_cast<int16_t>(520 - (step * 5));
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

#if !TB_MOCK_SENSOR_ENABLED && TB_TSL2591_ENABLED
  float illuminanceLux = NAN;
  if (readTsl2591Lux(illuminanceLux)) {
    sample.illuminanceLux = illuminanceLux;
    sample.validity |= kIlluminanceValid;

#if TB_PPFD_CALIBRATION_ENABLED
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
  float soilTemperature = soilTemperatureSensors.getTempCByIndex(0);
  if (soilTemperature == DEVICE_DISCONNECTED_C) {
    // begin() enumerates the bus once and caches the result, so a probe that
    // was not answering at start-up stays absent for the rest of the run and
    // every later read returns DEVICE_DISCONNECTED_C -- seen on a node whose
    // sensor a standalone OneWire scan found on every single pass.
    // Re-enumerate before giving up, the same way the TSL2591 path recovers
    // from a failed read.
    soilTemperatureSensors.begin();
    soilTemperatureSensors.requestTemperatures();
    soilTemperature = soilTemperatureSensors.getTempCByIndex(0);
  }
  if (soilTemperature != DEVICE_DISCONNECTED_C && isfinite(soilTemperature)) {
    sample.soilTemperatureC = soilTemperature;
    sample.validity |= kSoilTemperatureValid;
  }
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_MOISTURE_ENABLED
  const int rawSoilMoisture = static_cast<int>(readSoilMoistureRawAdc());
  sample.soilMoistureRawAdc = static_cast<int16_t>(rawSoilMoisture);
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
