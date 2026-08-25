// =============================================================================
//  PIN SMOKE TEST — NOT PRODUCTION FIRMWARE. DO NOT DEPLOY.
// =============================================================================
//
//  Confirms, by eye, that the actuator wiring works before any campaign runs.
//  It answers exactly one question: does commanding a pin move the pump?
//
//  Why a separate sketch rather than the production firmware:
//
//    * it opens no sensor bus. No OneWire, no DHT, no I2C. The production build
//      currently drives the DS18B20 bus on the same pin the pump MOSFET sits on
//      (TB_SOIL_TEMPERATURE_PIN vs TB_PUMP_PIN), so running main.cpp before that
//      is corrected would pulse the gate on every telemetry cycle. This sketch
//      cannot, because it never talks to a sensor.
//    * it bounds the exposure. There are no interlocks here — no G1 clamp, no
//      G2 cooldown, no G3 dead-man. Keeping that code in one throwaway sketch
//      means the pump is only ever unguarded for the minutes this test takes.
//
//  It is excluded from the default PlatformIO environments and must be built
//  explicitly:
//
//      pio run -e pin_smoke_test -t upload --upload-port <PORT>
//      pio device monitor -e pin_smoke_test
//
//  Commands, one action per line:
//
//      4    drive D4 (pump) high for 2 s
//      5    drive D5 (light) high for 2 s
//      s    drive both low immediately
//
//  Run it with the pump's power supply disconnected first: the MOSFET module's
//  channel LEDs are enough to tell which pin is which, and a mis-identified
//  channel then costs nothing.
//
// =============================================================================

// Build selector. This translation unit defines setup() and loop(), and so does
// main.cpp; a build system that compiles both gets a duplicate-symbol link
// error. PlatformIO excludes one of them per environment via build_src_filter,
// but Arduino CLI has no equivalent and compiles every source under src/, so
// without this guard `arduino-cli compile` cannot build the sketch at all -
// which is the documented procedure for the gateway, where PlatformIO is not
// installed. Opt-in rather than opt-out: the default build is the production
// firmware, and this bench sketch drives actuators without any of the
// interlocks.
#if defined(TB_PIN_SMOKE_TEST) && TB_PIN_SMOKE_TEST

#include <Arduino.h>

namespace {

// Hard-coded rather than taken from TelemetryConfig.h. This sketch exists to
// check the wiring against the intended layout, so it must not inherit whatever
// the configuration currently claims — that is the thing under test.
constexpr uint8_t kPumpPin = 4;
constexpr uint8_t kLightPin = 5;

// Long enough to see water move in the tube, short enough that a wiring mistake
// cannot empty a reservoir. At the measured 0.98 mL/s this is roughly 2 mL.
constexpr uint32_t kPulseMs = 2000UL;

constexpr uint32_t kSerialBaud = 115200UL;
constexpr uint32_t kSerialReadyTimeoutMs = 2000UL;

// Which pin is currently held high, or 0 for none. The deadline is only
// meaningful while this is non-zero.
uint8_t activePin = 0;
uint32_t pulseDeadlineMs = 0;

const __FlashStringHelper* pinName(const uint8_t pin) {
  return pin == kPumpPin ? F("D4 pump") : F("D5 light");
}

void allOff(const __FlashStringHelper* why) {
  digitalWrite(kPumpPin, LOW);
  digitalWrite(kLightPin, LOW);
  if (activePin != 0) {
    Serial.print(F("# off   "));
    Serial.print(pinName(activePin));
    Serial.print(F("  ("));
    Serial.print(why);
    Serial.println(')');
  }
  activePin = 0;
}

void startPulse(const uint8_t pin) {
  // One at a time. Driving both channels would make it ambiguous which one the
  // pump responded to, which is the whole point of the test.
  if (activePin != 0) {
    allOff(F("superseded"));
  }

  activePin = pin;
  pulseDeadlineMs = millis() + kPulseMs;
  digitalWrite(pin, HIGH);

  Serial.print(F("# on    "));
  Serial.print(pinName(pin));
  Serial.print(F("  for "));
  Serial.print(kPulseMs);
  Serial.println(F(" ms  — type 's' to stop early"));
}

void handleCommand(const char verb) {
  switch (verb) {
    case '4':
      startPulse(kPumpPin);
      break;
    case '5':
      startPulse(kLightPin);
      break;
    case 's':
    case 'S':
      allOff(F("stop command"));
      break;
    default:
      Serial.print(F("# ignored unknown command: "));
      Serial.println(verb);
      break;
  }
}

void pollSerial() {
  while (Serial.available() > 0) {
    const char character = static_cast<char>(Serial.read());
    if (character == '\n' || character == '\r' || character == ' ') {
      continue;
    }
    handleCommand(character);
  }
}

}  // namespace

void setup() {
  // Same order as the production G4 boot sequence: write the off level while
  // the pin is still an input, then switch to OUTPUT. Writing the port register
  // first means switching to OUTPUT drives low directly instead of briefly
  // arming the pull-up.
  digitalWrite(kPumpPin, LOW);
  digitalWrite(kLightPin, LOW);
  pinMode(kPumpPin, OUTPUT);
  pinMode(kLightPin, OUTPUT);

  Serial.begin(kSerialBaud);
  const uint32_t serialStartedAtMs = millis();
  while (!Serial && (millis() - serialStartedAtMs) < kSerialReadyTimeoutMs) {
  }

  Serial.println(F("# terrabyte pin smoke test, NOT production firmware"));
  Serial.println(F("# no sensor bus is opened; no interlocks are present"));
  Serial.println(F("# pins: D4=pump D5=light, active HIGH, both driven LOW now"));
  Serial.println(F("# commands: 4=pulse pump  5=pulse light  s=stop"));
}

void loop() {
  pollSerial();

  if (activePin == 0) {
    return;
  }

  // Unsigned subtraction, so a millis() rollover mid-pulse ends it on time
  // rather than holding the pin high for another 49 days.
  if (static_cast<int32_t>(millis() - pulseDeadlineMs) >= 0) {
    allOff(F("elapsed"));
  }
}

#endif  // TB_PIN_SMOKE_TEST
