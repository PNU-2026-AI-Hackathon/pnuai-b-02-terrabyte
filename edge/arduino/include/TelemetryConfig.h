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

// TSL2591 digital illuminance sensor over I2C at its fixed address, 0x29.
#ifndef TB_TSL2591_ENABLED
#define TB_TSL2591_ENABLED 1
#endif

#ifndef TB_TSL2591_I2C_ADDRESS
#define TB_TSL2591_I2C_ADDRESS 0x29
#endif

#if TB_TSL2591_I2C_ADDRESS != 0x29
#error "TB_TSL2591_I2C_ADDRESS must be 0x29"
#endif

#ifndef TB_TSL2591_GAIN
#define TB_TSL2591_GAIN 25
#endif

#if TB_TSL2591_GAIN != 1 && TB_TSL2591_GAIN != 25 && \
    TB_TSL2591_GAIN != 428 && TB_TSL2591_GAIN != 9876
#error "TB_TSL2591_GAIN must be 1, 25, 428, or 9876"
#endif

#ifndef TB_TSL2591_INTEGRATION_MS
#define TB_TSL2591_INTEGRATION_MS 300
#endif

#if TB_TSL2591_INTEGRATION_MS != 100 && \
    TB_TSL2591_INTEGRATION_MS != 200 && \
    TB_TSL2591_INTEGRATION_MS != 300 && \
    TB_TSL2591_INTEGRATION_MS != 400 && \
    TB_TSL2591_INTEGRATION_MS != 500 && \
    TB_TSL2591_INTEGRATION_MS != 600
#error "TB_TSL2591_INTEGRATION_MS must be 100, 200, 300, 400, 500, or 600"
#endif

#ifndef TB_TSL2591_AUTO_GAIN_ENABLED
#define TB_TSL2591_AUTO_GAIN_ENABLED 1
#endif

// Illuminance is not PPFD. Enable this conversion only after calibration
// against a PAR/PPFD reference using the final light source.
#ifndef TB_PPFD_CALIBRATION_ENABLED
#define TB_PPFD_CALIBRATION_ENABLED 0
#endif

#if TB_PPFD_CALIBRATION_ENABLED && !TB_TSL2591_ENABLED
#error "The light sensor must be enabled when PPFD conversion is enabled"
#endif

#if !TB_MOCK_SENSOR_ENABLED && TB_PPFD_CALIBRATION_ENABLED
#ifndef TB_PPFD_PER_LUX
#error "Define calibrated TB_PPFD_PER_LUX when PPFD conversion is enabled"
#endif
#ifndef TB_PPFD_OFFSET
#error "Define calibrated TB_PPFD_OFFSET when PPFD conversion is enabled"
#endif
#ifndef TB_PPFD_CALIBRATED_MIN_LUX
#error "Define TB_PPFD_CALIBRATED_MIN_LUX when PPFD conversion is enabled"
#endif
#ifndef TB_PPFD_CALIBRATED_MAX_LUX
#error "Define TB_PPFD_CALIBRATED_MAX_LUX when PPFD conversion is enabled"
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
#define TB_SOIL_MOISTURE_ADC_PIN A0
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

// TSL2591 rated maximum illuminance.
#ifndef TB_MAX_ILLUMINANCE_LUX
#define TB_MAX_ILLUMINANCE_LUX 88000.0f
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
