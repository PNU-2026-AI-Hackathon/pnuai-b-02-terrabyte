// Build selector. This translation unit defines setup() and loop(), and so does
// main.cpp; a build system that compiles both gets a duplicate-symbol link
// error. PlatformIO excludes one of them per environment via build_src_filter,
// but Arduino CLI has no equivalent and compiles every source under src/, so
// without this guard `arduino-cli compile` cannot build the sketch at all -
// which is the documented procedure for the gateway, where PlatformIO is not
// installed. Opt-in rather than opt-out: the default build is the production
// firmware, and this bench sketch drives no actuators and carries none of the
// interlocks.
#if defined(TB_DS18B20_DIAGNOSTIC) && TB_DS18B20_DIAGNOSTIC

#include <Arduino.h>
#include <DallasTemperature.h>
#include <OneWire.h>
#include <math.h>

#include "../include/TelemetryConfig.h"

namespace {

// The probe sits on the line the production firmware reads, so this tracks
// TB_SOIL_TEMPERATURE_PIN rather than repeating the number. It was hard-coded
// to 4 until 2026-08-25, which is the PUMP output: every run of this
// diagnostic clocked OneWire timing onto the pump MOSFET gate and then
// reported DISCONNECTED or the 85 C power-on value, because no DS18B20 was
// ever on that line.
constexpr uint8_t kOneWirePin = TB_SOIL_TEMPERATURE_PIN;
constexpr unsigned long kSampleIntervalMs = 2000UL;
constexpr float kDs18b20PowerOnC = 85.0f;

OneWire oneWire(kOneWirePin);
DallasTemperature sensors(&oneWire);

void printAddress(const uint8_t address[8]) {
  for (uint8_t index = 0; index < 8; ++index) {
    if (address[index] < 0x10) {
      Serial.print('0');
    }
    Serial.print(address[index], HEX);
  }
}

uint8_t enumerateBus() {
  uint8_t address[8];
  uint8_t count = 0;

  oneWire.reset_search();
  while (oneWire.search(address)) {
    ++count;
    const bool crcValid = OneWire::crc8(address, 7) == address[7];
    const bool familyValid = address[0] == 0x28;

    Serial.print(F("ROM "));
    Serial.print(count);
    Serial.print(F(": "));
    printAddress(address);
    Serial.print(F(" crc="));
    Serial.print(crcValid ? F("valid") : F("INVALID"));
    Serial.print(F(" family="));
    Serial.println(familyValid ? F("DS18B20") : F("UNSUPPORTED"));
  }
  oneWire.reset_search();
  return count;
}

void printTemperatures() {
  const uint8_t count = sensors.getDeviceCount();
  Serial.print(F("DallasTemperature device_count="));
  Serial.println(count);

  if (count == 0) {
    Serial.println(F("state=DISCONNECTED no DS18B20 detected on D4"));
    return;
  }

  sensors.requestTemperatures();
  for (uint8_t index = 0; index < count; ++index) {
    DeviceAddress address;
    Serial.print(F("sensor="));
    Serial.print(index);

    if (!sensors.getAddress(address, index)) {
      Serial.println(F(" state=INVALID_ADDRESS"));
      continue;
    }

    Serial.print(F(" rom="));
    printAddress(address);
    const float temperatureC = sensors.getTempC(address);
    Serial.print(F(" temperature_c="));

    if (temperatureC == DEVICE_DISCONNECTED_C) {
      Serial.println(F("DISCONNECTED state=READ_FAILED"));
    } else if (!isfinite(temperatureC) || temperatureC < -55.0f ||
               temperatureC > 125.0f) {
      Serial.print(temperatureC);
      Serial.println(F(" state=OUT_OF_RANGE"));
    } else if (temperatureC == kDs18b20PowerOnC) {
      Serial.println(F("85.00 state=POWER_ON_VALUE"));
    } else {
      Serial.print(temperatureC, 2);
      Serial.println(F(" state=OK"));
    }
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("DS18B20-only diagnostic; OneWire pin=D4"));
  const uint8_t romCount = enumerateBus();
  Serial.print(F("OneWire ROM count="));
  Serial.println(romCount);

  sensors.begin();
  printTemperatures();
}

void loop() {
  delay(kSampleIntervalMs);
  Serial.println(F("--- sample ---"));
  printTemperatures();
}

#endif  // TB_DS18B20_DIAGNOSTIC
