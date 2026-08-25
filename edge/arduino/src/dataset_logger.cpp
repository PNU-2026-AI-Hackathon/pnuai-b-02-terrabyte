// =============================================================================
//  DATASET LOGGER — NOT PRODUCTION FIRMWARE. DO NOT DEPLOY.
// =============================================================================
//
//  This sketch exists only to collect a labelled irrigation dataset from a pot
//  on a bench. It is NOT the firmware the product ships.
//
//  Differences from the deployed firmware (src/main.cpp), all deliberate:
//
//    * emits CSV rows, not the telemetry v1 JSON Lines contract. The Orange Pi
//      bridge cannot parse this output and will reject every line.
//    * emits rows even when sensors are invalid, because a dataset needs the
//      failures too. main.cpp suppresses those into `sensor_status`.
//    * accepts inbound serial commands to mark irrigation events. The deployed
//      firmware is output-only at this protocol version.
//    * samples once per minute rather than every few seconds.
//    * drives no actuators and contains none of the ActuatorGuard interlocks
//      (P2-1), so it must never be left on a pot wired to a pump.
//
//  It is excluded from the default PlatformIO environments and must be built
//  explicitly:
//
//      pio run -e dataset_logger -t upload
//      pio device monitor -e dataset_logger
//
//  Wiring matches the production build; only the sketch differs.
//
// =============================================================================

// Build selector. This translation unit defines setup() and loop(), and so does
// main.cpp; a build system that compiles both gets a duplicate-symbol link
// error. PlatformIO excludes one of them per environment via build_src_filter,
// but Arduino CLI has no equivalent and compiles every source under src/, so
// without this guard `arduino-cli compile` cannot build the sketch at all -
// which is the documented procedure for the gateway, where PlatformIO is not
// installed. Opt-in rather than opt-out: the default build is the production
// firmware, and this bench sketch drives no actuators and carries none of the
// interlocks.
#if defined(TB_DATASET_LOGGER) && TB_DATASET_LOGGER

#include <Arduino.h>
#include <ctype.h>
#include <math.h>
#include <stdint.h>
#include <string.h>

#include "../include/SensorAdapter.h"
#include "../include/TelemetryConfig.h"

namespace {

// Deliberately not TB_FIRMWARE_VERSION. Any capture carrying this string is
// bench data, and every downstream consumer should be able to see that.
constexpr char kLoggerVersion[] = "dataset-logger-0.1.0-BENCH-ONLY";

// A dataset spanning days does not need five-second resolution, and a slower
// cadence keeps a capture file small enough to inspect by hand.
#ifndef TB_DATASET_INTERVAL_MS
#define TB_DATASET_INTERVAL_MS 60000UL
#endif

constexpr size_t kCommandBufferSize = 16;

uint32_t nextSequence = 0;
uint32_t nextSampleAtMs = 0;

char commandBuffer[kCommandBufferSize];
size_t commandLength = 0;

// Set by an operator command, consumed by the row it annotates.
const __FlashStringHelper* pendingEvent = nullptr;
uint16_t pendingEventMl = 0;

void printHeader() {
  Serial.print(F("# terrabyte dataset logger, NOT production firmware; node="));
  Serial.print(TB_NODE_ID);
  Serial.print(F(" logger="));
  Serial.print(kLoggerVersion);
  Serial.print(F(" interval_ms="));
  Serial.println(TB_DATASET_INTERVAL_MS);
  Serial.println(
      F("# validity bits: 1=air_t 2=rh 4=ppfd 8=soil_t 16=soil_moist 32=lux"));
  Serial.println(
      F("# commands: w<ml>=mark irrigation, m=mark note, h=reprint header"));
  Serial.println(
      F("sequence,uptime_ms,air_temperature_c,relative_humidity_pct,"
        "ppfd_umol_m2_s,illuminance_lux,soil_temperature_c,soil_moisture_pct,"
        "soil_moisture_raw_adc,validity,event,event_ml"));
}

// An invalid reading is written as an empty field rather than 0 or NaN, so the
// host parser cannot silently treat a sensor failure as a measurement.
void printFloatField(const float value, const uint8_t validity,
                     const uint8_t requiredBit) {
  Serial.print(',');
  if ((validity & requiredBit) && isfinite(value)) {
    Serial.print(value, 2);
  }
}

void printRow(const uint32_t sequence, const uint32_t uptimeMs,
              const SensorSample& sample) {
  Serial.print(sequence);
  Serial.print(',');
  Serial.print(uptimeMs);

  printFloatField(sample.airTemperatureC, sample.validity, kAirTemperatureValid);
  printFloatField(sample.relativeHumidityPct, sample.validity,
                  kRelativeHumidityValid);
  printFloatField(sample.ppfdUmolM2S, sample.validity, kPpfdValid);
  printFloatField(sample.illuminanceLux, sample.validity, kIlluminanceValid);
  printFloatField(sample.soilTemperatureC, sample.validity,
                  kSoilTemperatureValid);
  printFloatField(sample.soilMoisturePct, sample.validity, kSoilMoistureValid);

  Serial.print(',');
  if (sample.soilMoistureRawAdc != kSoilMoistureRawAdcAbsent) {
    Serial.print(sample.soilMoistureRawAdc);
  }

  Serial.print(',');
  Serial.print(sample.validity);

  Serial.print(',');
  if (pendingEvent != nullptr) {
    Serial.print(pendingEvent);
    Serial.print(',');
    Serial.print(pendingEventMl);
    pendingEvent = nullptr;
    pendingEventMl = 0;
  } else {
    Serial.print(',');
  }
  Serial.println();
}

void emitRowNow() {
  const uint32_t now = millis();
  printRow(nextSequence++, now, readSensorSample());
}

// `w<ml>` marks that the operator has just watered the pot by hand. The volume
// is what makes the capture a supervised dataset rather than a sensor trace:
// without it there is no irrigation history to derive labels from.
void handleCommand() {
  if (commandLength == 0) {
    return;
  }

  const char verb = static_cast<char>(tolower(commandBuffer[0]));
  if (verb == 'h') {
    printHeader();
    return;
  }
  if (verb == 'm') {
    pendingEvent = F("note");
    pendingEventMl = 0;
    emitRowNow();
    return;
  }
  if (verb != 'w') {
    Serial.print(F("# ignored unknown command: "));
    Serial.println(commandBuffer);
    return;
  }

  uint32_t millilitres = 0;
  bool hasDigit = false;
  for (size_t index = 1; index < commandLength; ++index) {
    const char character = commandBuffer[index];
    if (!isdigit(static_cast<unsigned char>(character))) {
      continue;
    }
    hasDigit = true;
    millilitres = (millilitres * 10U) + static_cast<uint32_t>(character - '0');
    if (millilitres > 60000U) {
      millilitres = 60000U;
      break;
    }
  }
  if (!hasDigit) {
    Serial.println(F("# irrigation command needs a volume, e.g. w120"));
    return;
  }

  pendingEvent = F("irrigation");
  pendingEventMl = static_cast<uint16_t>(millilitres);
  // Emit immediately: the moment of watering is the label, and waiting for the
  // next scheduled row would attach it to soil that has already started to wet.
  emitRowNow();
}

void pollSerialCommands() {
  while (Serial.available() > 0) {
    const char character = static_cast<char>(Serial.read());
    if (character == '\n' || character == '\r') {
      commandBuffer[commandLength] = '\0';
      handleCommand();
      commandLength = 0;
      continue;
    }
    if (commandLength + 1 < kCommandBufferSize) {
      commandBuffer[commandLength++] = character;
    }
  }
}

}  // namespace

void setup() {
  Serial.begin(TB_SERIAL_BAUD);
  const uint32_t serialStartedAtMs = millis();
  while (!Serial &&
         (millis() - serialStartedAtMs) < TB_SERIAL_READY_TIMEOUT_MS) {
  }

  beginSensorAdapter();
  printHeader();

  nextSampleAtMs = millis() + TB_DATASET_INTERVAL_MS;
}

void loop() {
  pollSerialCommands();

  const uint32_t now = millis();
  if (static_cast<int32_t>(now - nextSampleAtMs) < 0) {
    return;
  }

  printRow(nextSequence++, now, readSensorSample());

  nextSampleAtMs += TB_DATASET_INTERVAL_MS;
  if (static_cast<int32_t>(now - nextSampleAtMs) >= 0) {
    nextSampleAtMs = now + TB_DATASET_INTERVAL_MS;
  }
}

#endif  // TB_DATASET_LOGGER
