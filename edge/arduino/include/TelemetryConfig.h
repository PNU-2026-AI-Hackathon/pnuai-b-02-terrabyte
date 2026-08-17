#pragma once

// A machine-local header can override any TB_* setting below. The local file
// is intentionally ignored by Git; copy TelemetryConfig.local.h.example to
// TelemetryConfig.local.h before provisioning a device.
#if defined(__has_include)
#if __has_include("TelemetryConfig.local.h")
#include "TelemetryConfig.local.h"
#endif
#endif

#ifndef TB_NODE_ID
#define TB_NODE_ID "UNCONFIGURED"
#endif

#ifndef TB_FIRMWARE_VERSION
#define TB_FIRMWARE_VERSION "0.3.0"
#endif

#ifndef TB_SERIAL_BAUD
#define TB_SERIAL_BAUD 115200UL
#endif

// Native-USB boards get a short window for the host to open the port, which
// makes the startup hello less likely to be lost. Sampling still starts if no
// host is connected.
#ifndef TB_SERIAL_READY_TIMEOUT_MS
#define TB_SERIAL_READY_TIMEOUT_MS 2000UL
#endif

#ifndef TB_MOCK_SENSOR_ENABLED
#define TB_MOCK_SENSOR_ENABLED 0
#endif

// DHT22 should not be sampled faster than once every two seconds.
#ifndef TB_TELEMETRY_INTERVAL_MS
#define TB_TELEMETRY_INTERVAL_MS 5000UL
#endif

#ifndef TB_DHT22_ENABLED
#define TB_DHT22_ENABLED 1
#endif

#ifndef TB_DHT22_PIN
#define TB_DHT22_PIN 2
#endif

#if TB_TELEMETRY_INTERVAL_MS == 0UL
#error "TB_TELEMETRY_INTERVAL_MS must be greater than zero"
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_DHT22_ENABLED && \
    TB_TELEMETRY_INTERVAL_MS < 2000UL
#error "TB_TELEMETRY_INTERVAL_MS must be at least 2000 for DHT22"
#endif

// GY-30 modules normally use a BH1750 digital illuminance sensor over I2C.
// ADD=GND selects 0x23; ADD=VCC selects 0x5C.
#ifndef TB_GY30_ENABLED
#define TB_GY30_ENABLED 1
#endif

#ifndef TB_GY30_I2C_ADDRESS
#define TB_GY30_I2C_ADDRESS 0x23
#endif

#if TB_GY30_I2C_ADDRESS != 0x23 && TB_GY30_I2C_ADDRESS != 0x5C
#error "TB_GY30_I2C_ADDRESS must be 0x23 or 0x5C"
#endif

// BH1750 measures illuminance in lux, not PPFD. Enable this conversion only
// after calibration against a PAR/PPFD reference using the final light source.
#ifndef TB_GY30_PPFD_CALIBRATION_ENABLED
#define TB_GY30_PPFD_CALIBRATION_ENABLED 0
#endif

#if TB_GY30_PPFD_CALIBRATION_ENABLED && !TB_GY30_ENABLED
#error "GY-30 must be enabled when GY-30 PPFD conversion is enabled"
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_GY30_PPFD_CALIBRATION_ENABLED
#ifndef TB_PPFD_PER_LUX
#error "Define calibrated TB_PPFD_PER_LUX when GY-30 PPFD conversion is enabled"
#endif
#ifndef TB_PPFD_OFFSET
#error "Define calibrated TB_PPFD_OFFSET when GY-30 PPFD conversion is enabled"
#endif
#ifndef TB_PPFD_CALIBRATED_MIN_LUX
#error "Define TB_PPFD_CALIBRATED_MIN_LUX when GY-30 PPFD conversion is enabled"
#endif
#ifndef TB_PPFD_CALIBRATED_MAX_LUX
#error "Define TB_PPFD_CALIBRATED_MAX_LUX when GY-30 PPFD conversion is enabled"
#endif
#endif

// Optional waterproof DS18B20 soil-temperature probe on a OneWire bus.
#ifndef TB_SOIL_TEMPERATURE_ENABLED
#define TB_SOIL_TEMPERATURE_ENABLED 0
#endif

#ifndef TB_SOIL_TEMPERATURE_PIN
#define TB_SOIL_TEMPERATURE_PIN 3
#endif

// Optional analog capacitive soil-moisture sensor. Calibration endpoints are
// deliberately required because ADC direction and values vary by sensor,
// supply voltage, soil, and board.
#ifndef TB_SOIL_MOISTURE_ENABLED
#define TB_SOIL_MOISTURE_ENABLED 0
#endif

#ifndef TB_SOIL_MOISTURE_ADC_PIN
#define TB_SOIL_MOISTURE_ADC_PIN A1
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_SOIL_MOISTURE_ENABLED
#ifndef TB_SOIL_MOISTURE_DRY_ADC
#error "Define calibrated TB_SOIL_MOISTURE_DRY_ADC when soil moisture is enabled"
#endif
#ifndef TB_SOIL_MOISTURE_WET_ADC
#error "Define calibrated TB_SOIL_MOISTURE_WET_ADC when soil moisture is enabled"
#endif
#if TB_SOIL_MOISTURE_DRY_ADC == TB_SOIL_MOISTURE_WET_ADC
#error "Soil-moisture dry and wet ADC calibration values must differ"
#endif
#endif

// Validation limits. The temperature limits match the rated DHT22 range.
#ifndef TB_MIN_AIR_TEMPERATURE_C
#define TB_MIN_AIR_TEMPERATURE_C (-40.0f)
#endif

#ifndef TB_MAX_AIR_TEMPERATURE_C
#define TB_MAX_AIR_TEMPERATURE_C 80.0f
#endif

#ifndef TB_MIN_RELATIVE_HUMIDITY_PCT
#define TB_MIN_RELATIVE_HUMIDITY_PCT 0.0f
#endif

#ifndef TB_MAX_RELATIVE_HUMIDITY_PCT
#define TB_MAX_RELATIVE_HUMIDITY_PCT 100.0f
#endif

#ifndef TB_MIN_PPFD_UMOL_M2_S
#define TB_MIN_PPFD_UMOL_M2_S 0.0f
#endif

#ifndef TB_MAX_PPFD_UMOL_M2_S
#define TB_MAX_PPFD_UMOL_M2_S 5000.0f
#endif

#ifndef TB_MIN_ILLUMINANCE_LUX
#define TB_MIN_ILLUMINANCE_LUX 0.0f
#endif

// BH1750 high-resolution output is a 16-bit count divided by 1.2.
#ifndef TB_MAX_ILLUMINANCE_LUX
#define TB_MAX_ILLUMINANCE_LUX 54612.5f
#endif

#ifndef TB_MIN_SOIL_TEMPERATURE_C
#define TB_MIN_SOIL_TEMPERATURE_C (-20.0f)
#endif

#ifndef TB_MAX_SOIL_TEMPERATURE_C
#define TB_MAX_SOIL_TEMPERATURE_C 80.0f
#endif

#ifndef TB_MIN_SOIL_MOISTURE_PCT
#define TB_MIN_SOIL_MOISTURE_PCT 0.0f
#endif

#ifndef TB_MAX_SOIL_MOISTURE_PCT
#define TB_MAX_SOIL_MOISTURE_PCT 100.0f
#endif

// ---------------------------------------------------------------------------
// Actuator hard interlocks (G1-G3). See docs/design/edge_ai_hardening.md.
//
// These bounds exist so the pump stops on its own when the Orange Pi, the
// broker, and the cloud are all dead. No inbound command can widen them: a
// command asks for a duration and the firmware answers with a duration.
// ---------------------------------------------------------------------------

// G1 absolute maximum single run. A command asking for more is clamped, not
// rejected, so a mis-scaled request still delivers water instead of nothing.
#ifndef TB_PUMP_ABS_MAX_MS
#define TB_PUMP_ABS_MAX_MS 30000UL
#endif

// G2 minimum interval between runs, measured from the last stop.
#ifndef TB_PUMP_MIN_INTERVAL_MS
#define TB_PUMP_MIN_INTERVAL_MS 600000UL
#endif

// G3 dead-man watchdog. While the pump runs, any inbound serial byte counts as
// proof the host is alive; silence for this long stops the pump.
#ifndef TB_HOST_TIMEOUT_MS
#define TB_HOST_TIMEOUT_MS 3000UL
#endif

#if TB_PUMP_ABS_MAX_MS == 0UL
#error "TB_PUMP_ABS_MAX_MS must be greater than zero"
#endif

#if TB_HOST_TIMEOUT_MS == 0UL
#error "TB_HOST_TIMEOUT_MS must be greater than zero"
#endif

// The dead-man window has to outlast one host tick plus jitter, otherwise a
// perfectly healthy link aborts every run.
#if TB_HOST_TIMEOUT_MS < 1000UL
#error "TB_HOST_TIMEOUT_MS must exceed the 1s host dead-man tick period"
#endif

// The firmware cooldown and the server cooldown (6h) are managed separately, so
// they can drift apart. The firmware side must always be the shorter of the two
// or the firmware rejects commands the server already approved, which reaches
// the user as an unexplained failure. 6h is the ceiling, not a target.
#if TB_PUMP_MIN_INTERVAL_MS >= 21600000UL
#error "TB_PUMP_MIN_INTERVAL_MS must stay below the 6h server cooldown"
#endif

// A run must fit inside the cooldown window; otherwise the guard would be
// asked to start a run that its own interval rule already forbids.
#if TB_PUMP_ABS_MAX_MS >= TB_PUMP_MIN_INTERVAL_MS
#error "TB_PUMP_ABS_MAX_MS must be shorter than TB_PUMP_MIN_INTERVAL_MS"
#endif

// Pump output wiring. No pump circuit exists yet, so the default output is the
// on-board LED: G4 and every state change stay observable on a bare board, and
// no unknown load can be energised by a firmware that was flashed before its
// wiring was decided. Point TB_PUMP_PIN at the relay input in the ignored local
// header once the circuit is built.
#ifndef TB_PUMP_PIN
#define TB_PUMP_PIN LED_BUILTIN
#endif

// Relay polarity. The design doc specifies "OUTPUT + LOW" for G4, which is only
// safe on an active-HIGH input; many low-cost relay modules are active LOW, and
// on those, driving LOW at boot turns the pump ON. So the off level is named
// rather than hard-coded, and it defaults to the documented LOW.
#ifndef TB_PUMP_ON_LEVEL
#define TB_PUMP_ON_LEVEL HIGH
#endif

#ifndef TB_PUMP_OFF_LEVEL
#define TB_PUMP_OFF_LEVEL LOW
#endif

// Guarded by ARDUINO because HIGH and LOW do not exist in the host test build,
// where both would preprocess to 0 and trip this check.
#if defined(ARDUINO) && (TB_PUMP_ON_LEVEL == TB_PUMP_OFF_LEVEL)
#error "TB_PUMP_ON_LEVEL and TB_PUMP_OFF_LEVEL must differ"
#endif
