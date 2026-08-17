#include <Arduino.h>
#include <ctype.h>
#include <math.h>
#include <stdint.h>
#include <string.h>

#include "../include/ActuatorGuard.h"
#include "../include/CommandParser.h"
#include "../include/SensorAdapter.h"
#include "../include/TelemetryConfig.h"

namespace {

constexpr uint8_t kProtocolVersion = 1;
constexpr size_t kMaxNodeIdLength = 64;

uint32_t nextSequence = 0;
uint32_t nextSampleAtMs = 0;
bool nodeIdIsValid = false;

// Mirror of the pump output level. The guard owns the decision to run; this
// tracks only what the pin was last driven to, so telemetry never has to read
// the decision back out of the hardware.
bool pumpIsOn = false;

tb::ActuatorGuard actuatorGuard;

// Inbound line assembly. The pattern is the one dataset_logger.cpp uses, but the
// buffer is sized for JSON rather than for a single-letter verb.
char inboundLine[TB_SERIAL_RX_LINE_MAX];
size_t inboundLength = 0;
bool inboundOverflowed = false;

bool isAllowedNodeIdCharacter(const char character) {
  return isalnum(static_cast<unsigned char>(character)) || character == '-' ||
         character == '_' || character == '.' || character == ':';
}

bool validateNodeId(const char* nodeId) {
  if (nodeId == nullptr) {
    return false;
  }

  const size_t length = strlen(nodeId);
  if (length == 0 || length > kMaxNodeIdLength ||
      strcmp(nodeId, "UNCONFIGURED") == 0) {
    return false;
  }

  for (size_t index = 0; index < length; ++index) {
    if (!isAllowedNodeIdCharacter(nodeId[index])) {
      return false;
    }
  }
  return true;
}

bool inRange(const float value, const float minimum, const float maximum) {
  return isfinite(value) && value >= minimum && value <= maximum;
}

uint8_t validatedFields(const SensorSample& sample) {
  uint8_t validity = sample.validity;

  if (!inRange(sample.airTemperatureC, TB_MIN_AIR_TEMPERATURE_C,
               TB_MAX_AIR_TEMPERATURE_C)) {
    validity &= ~kAirTemperatureValid;
  }
  if (!inRange(sample.relativeHumidityPct, TB_MIN_RELATIVE_HUMIDITY_PCT,
               TB_MAX_RELATIVE_HUMIDITY_PCT)) {
    validity &= ~kRelativeHumidityValid;
  }
  if (!inRange(sample.ppfdUmolM2S, TB_MIN_PPFD_UMOL_M2_S,
               TB_MAX_PPFD_UMOL_M2_S)) {
    validity &= ~kPpfdValid;
  }
#if TB_GY30_ENABLED
  if (!inRange(sample.illuminanceLux, TB_MIN_ILLUMINANCE_LUX,
               TB_MAX_ILLUMINANCE_LUX)) {
    validity &= ~kIlluminanceValid;
  }
#endif
#if TB_SOIL_TEMPERATURE_ENABLED
  if (!inRange(sample.soilTemperatureC, TB_MIN_SOIL_TEMPERATURE_C,
               TB_MAX_SOIL_TEMPERATURE_C)) {
    validity &= ~kSoilTemperatureValid;
  }
#endif
#if TB_SOIL_MOISTURE_ENABLED
  if (!inRange(sample.soilMoisturePct, TB_MIN_SOIL_MOISTURE_PCT,
               TB_MAX_SOIL_MOISTURE_PCT)) {
    validity &= ~kSoilMoistureValid;
  }
#endif

  return validity;
}

uint8_t requiredFields() {
  uint8_t required = kCoreTelemetryFieldsValid;
#if TB_GY30_ENABLED
  required |= kIlluminanceValid;
#endif
#if TB_SOIL_TEMPERATURE_ENABLED
  required |= kSoilTemperatureValid;
#endif
#if TB_SOIL_MOISTURE_ENABLED
  required |= kSoilMoistureValid;
#endif
  return required;
}

void printEnvelopeStart(const __FlashStringHelper* messageType) {
  Serial.print(F("{\"message_type\":\""));
  Serial.print(messageType);
  Serial.print(F("\",\"protocol_version\":"));
  Serial.print(kProtocolVersion);
  Serial.print(F(",\"node_id\":\""));
  Serial.print(TB_NODE_ID);
  Serial.print('"');
}

void emitHello() {
  printEnvelopeStart(F("hello"));
  Serial.print(F(",\"firmware_version\":\""));
  Serial.print(TB_FIRMWARE_VERSION);
  Serial.print(F("\",\"serial_baud\":"));
  Serial.print(TB_SERIAL_BAUD);
  Serial.print(F(",\"telemetry_interval_ms\":"));
  Serial.print(TB_TELEMETRY_INTERVAL_MS);
  Serial.print(F(",\"ready\":"));
  Serial.print(nodeIdIsValid ? F("true") : F("false"));
  Serial.println('}');
}

void emitConfigurationError() {
  printEnvelopeStart(F("configuration_error"));
  Serial.println(
      F(",\"reason\":\"node_id_missing_or_invalid\",\"ready\":false}"));
}

void emitSensorStatus(const uint32_t sequence, const uint32_t uptimeMs,
                      const uint8_t validity, const SensorSample& sample) {
  printEnvelopeStart(F("sensor_status"));
  Serial.print(F(",\"sequence\":"));
  Serial.print(sequence);
  Serial.print(F(",\"uptime_ms\":"));
  Serial.print(uptimeMs);
  Serial.print(F(",\"validity\":{\"air_temperature_c\":"));
  Serial.print((validity & kAirTemperatureValid) ? F("true") : F("false"));
  Serial.print(F(",\"relative_humidity_pct\":"));
  Serial.print((validity & kRelativeHumidityValid) ? F("true") : F("false"));
  Serial.print(F(",\"ppfd_umol_m2_s\":"));
  Serial.print((validity & kPpfdValid) ? F("true") : F("false"));
#if TB_GY30_ENABLED
  Serial.print(F(",\"illuminance_lux\":"));
  Serial.print((validity & kIlluminanceValid) ? F("true") : F("false"));
#endif
#if TB_SOIL_TEMPERATURE_ENABLED
  Serial.print(F(",\"soil_temperature_c\":"));
  Serial.print((validity & kSoilTemperatureValid) ? F("true") : F("false"));
#endif
#if TB_SOIL_MOISTURE_ENABLED
  Serial.print(F(",\"soil_moisture_pct\":"));
  Serial.print((validity & kSoilMoistureValid) ? F("true") : F("false"));
#endif
  Serial.print('}');
#if TB_GY30_ENABLED
  Serial.print(F(",\"illuminance_lux\":"));
  if (validity & kIlluminanceValid) {
    Serial.print(sample.illuminanceLux, 2);
  } else {
    Serial.print(F("null"));
  }
#endif
  Serial.println(F(",\"reason\":\"sensor_unavailable_or_out_of_range\"}"));
}

void emitTelemetry(const uint32_t sequence, const uint32_t uptimeMs,
                   const SensorSample& sample) {
  printEnvelopeStart(F("telemetry"));
  Serial.print(F(",\"sequence\":"));
  Serial.print(sequence);
  Serial.print(F(",\"uptime_ms\":"));
  Serial.print(uptimeMs);
  Serial.print(F(",\"air_temperature_c\":"));
  Serial.print(sample.airTemperatureC, 2);
  Serial.print(F(",\"relative_humidity_pct\":"));
  Serial.print(sample.relativeHumidityPct, 2);
  Serial.print(F(",\"ppfd_umol_m2_s\":"));
  Serial.print(sample.ppfdUmolM2S, 2);
#if TB_GY30_ENABLED
  Serial.print(F(",\"illuminance_lux\":"));
  Serial.print(sample.illuminanceLux, 2);
#endif
#if TB_SOIL_TEMPERATURE_ENABLED
  Serial.print(F(",\"soil_temperature_c\":"));
  Serial.print(sample.soilTemperatureC, 2);
#endif
#if TB_SOIL_MOISTURE_ENABLED
  Serial.print(F(",\"soil_moisture_pct\":"));
  Serial.print(sample.soilMoisturePct, 2);
#endif
  // Only the pump exists as an actuator, so only the pump is reported. The
  // object form is what the contract specifies, which lets a light or heater be
  // added later without changing the shape of the record.
  Serial.print(F(",\"actuators\":{\"pump\":"));
  Serial.print(pumpIsOn ? 1 : 0);

  // Remaining lockout, not the configured interval. Emitting the setting here
  // would tell the server the pump is permanently unavailable, and the two
  // values are identical for exactly one instant, which is why the guard's unit
  // tests pin the countdown rather than a single sample of it.
  Serial.print(F("},\"pump_lockout_ms\":"));
  Serial.print(actuatorGuard.pumpLockoutRemainingMs(uptimeMs));
  Serial.println('}');
}

// The ack envelope uses the short keys of the serial contract, not the
// `message_type` envelope of the telemetry records above. The two families are
// deliberately asymmetric: the Orange Pi is a translator and re-wraps acks into
// the long-key MQTT schema.
void printAckStart(const char* commandId, const __FlashStringHelper* phase) {
  Serial.print(F("{\"t\":\"ack\",\"id\":\""));
  Serial.print(commandId);
  Serial.print(F("\",\"ph\":\""));
  Serial.print(phase);
  Serial.print('"');
}

// Firmware-local diagnostic tokens. The same word can mean something different
// one layer up (the server's `cooldown` is a pre-publish denial, this one is a
// post-publish refusal), so upstream keys its state machine off `ph` and treats
// `r` as free text.
const __FlashStringHelper* rejectReasonToken(const tb::RejectReason reason) {
  switch (reason) {
    case tb::RejectReason::kBadRequest:
      return F("bad_request");
    case tb::RejectReason::kDuplicate:
      return F("duplicate");
    case tb::RejectReason::kBusy:
      return F("busy");
    case tb::RejectReason::kCooldown:
      return F("cooldown");
    case tb::RejectReason::kNone:
      break;
  }
  return F("unknown");
}

const __FlashStringHelper* stopCauseToken(const tb::StopCause cause) {
  switch (cause) {
    case tb::StopCause::kVolumeReached:
      return F("volume_reached");
    case tb::StopCause::kMaxRuntime:
      return F("max_runtime");
    case tb::StopCause::kWatchdog:
      return F("watchdog");
    case tb::StopCause::kNone:
      break;
  }
  return F("unknown");
}

void emitAckAccepted(const char* commandId) {
  printAckStart(commandId, F("accepted"));
  Serial.println('}');
}

void emitAckRejected(const char* commandId, const tb::RejectReason reason) {
  printAckStart(commandId, F("rejected"));
  Serial.print(F(",\"r\":\""));
  Serial.print(rejectReasonToken(reason));
  Serial.println(F("\"}"));
}

void emitAckRunEnded(const char* commandId, const tb::PumpStop& stop) {
  // A run cut short by the dead-man watchdog did not deliver its dose, so it is
  // an abort. Every other ending ran to the deadline it was granted.
  const bool aborted = stop.cause == tb::StopCause::kWatchdog;
  printAckStart(commandId, aborted ? F("aborted") : F("completed"));
  Serial.print(F(",\"ms\":"));
  Serial.print(stop.runtimeMs);
  Serial.print(F(",\"stop\":\""));
  Serial.print(stopCauseToken(stop.cause));
  Serial.println(F("\"}"));
}

void writePumpOutput(const bool on) {
  digitalWrite(TB_PUMP_PIN, on ? TB_PUMP_ON_LEVEL : TB_PUMP_OFF_LEVEL);
  pumpIsOn = on;
}

void handleInboundLine(const uint32_t nowMs) {
  const tb::InboundMessage message = tb::parseInboundLine(inboundLine);

  switch (message.kind) {
    case tb::InboundKind::kKeepAlive:
      // The bytes themselves already refreshed the dead-man window in
      // pollHostSerial(); the tick carries no other instruction.
      break;

    case tb::InboundKind::kPumpCommand: {
      const tb::PumpVerdict verdict =
          actuatorGuard.requestPump(message.id, message.runtimeMs, nowMs);
      if (!verdict.accepted) {
        emitAckRejected(message.id, verdict.reason);
        break;
      }
      // The pin moves before the ack is written. The guard has already started
      // timing the run, and the ack costs milliseconds of serial output that
      // would otherwise be charged to a pump that is not yet on.
      writePumpOutput(true);
      emitAckAccepted(message.id);
      break;
    }

    case tb::InboundKind::kUnusableCommand:
      // With no readable id there is nothing to address an ack to, and the
      // command will expire upstream instead.
      if (message.id[0] != '\0') {
        emitAckRejected(message.id, tb::RejectReason::kBadRequest);
      }
      break;

    case tb::InboundKind::kIgnored:
      break;
  }
}

void pollHostSerial(const uint32_t nowMs) {
  while (Serial.available() > 0) {
    const char character = static_cast<char>(Serial.read());

    // G3 keys off bytes, not off their meaning. A host sending a line this
    // firmware cannot parse is still a host that is alive, and treating a
    // malformed line as silence would abort a run that is going fine.
    actuatorGuard.noteHostActivity(nowMs);

    if (character == '\n' || character == '\r') {
      if (inboundLength > 0 && !inboundOverflowed) {
        inboundLine[inboundLength] = '\0';
        handleInboundLine(nowMs);
      }
      inboundLength = 0;
      inboundOverflowed = false;
      continue;
    }

    if (inboundLength + 1 < TB_SERIAL_RX_LINE_MAX) {
      inboundLine[inboundLength++] = character;
    } else {
      // An over-long line is discarded whole rather than parsed as a truncated
      // command. No diagnostic is written: the link is strict JSONL, and a
      // dropped command becomes an upstream TTL expiry, which is visible there.
      inboundOverflowed = true;
    }
  }
}

void serviceActuators(const uint32_t nowMs) {
  const tb::PumpStop stop = actuatorGuard.tick(nowMs);
  if (!stop.stopped) {
    return;
  }

  // Output first, ack second. Writing about 60 bytes at 115200 baud takes
  // several milliseconds, and none of them should be pumping.
  writePumpOutput(false);
  emitAckRunEnded(actuatorGuard.activeCommandId(), stop);
}

void sampleAndPublish(const uint32_t uptimeMs) {
  const uint32_t sequence = nextSequence++;

  if (!nodeIdIsValid) {
    emitConfigurationError();
    return;
  }

  const SensorSample sample = readSensorSample();
  const uint8_t validity = validatedFields(sample);
  const uint8_t required = requiredFields();
  if ((validity & required) != required) {
    emitSensorStatus(sequence, uptimeMs, validity, sample);
    return;
  }

  emitTelemetry(sequence, uptimeMs, sample);
}

}  // namespace

void setup() {
  // G4 boot safety. These three statements must stay the first thing setup()
  // does. A reset while the pump was running re-enters setup() with the relay
  // still energised, and Serial.begin() below can block for up to
  // TB_SERIAL_READY_TIMEOUT_MS waiting for a host that may never arrive. Any
  // work placed above this point is time the pump keeps running unattended.
  //
  // The write comes before pinMode on purpose, which is the reverse of the usual
  // idiom: setting the port register while the pin is still an input only arms
  // the pull-up, so switching to OUTPUT afterwards drives the off level with no
  // intermediate glitch. Written the other way round, an active-LOW relay would
  // see a brief ON pulse on every boot.
  digitalWrite(TB_PUMP_PIN, TB_PUMP_OFF_LEVEL);
  pinMode(TB_PUMP_PIN, OUTPUT);
  pumpIsOn = false;

  Serial.begin(TB_SERIAL_BAUD);
  const uint32_t serialStartedAtMs = millis();
  while (!Serial &&
         (millis() - serialStartedAtMs) < TB_SERIAL_READY_TIMEOUT_MS) {
  }

  beginSensorAdapter();

  nodeIdIsValid = validateNodeId(TB_NODE_ID);
  emitHello();
  if (!nodeIdIsValid) {
    emitConfigurationError();
  }

  nextSampleAtMs = millis() + TB_TELEMETRY_INTERVAL_MS;
}

void loop() {
  const uint32_t now = millis();

  // Both of these run on every iteration, ahead of the sampling cadence. A pump
  // deadline and a dead-man timeout are only as sharp as the interval between
  // two consecutive tick() calls.
  pollHostSerial(now);
  serviceActuators(now);

  if (static_cast<int32_t>(now - nextSampleAtMs) < 0) {
    return;
  }

  sampleAndPublish(now);

  // A DHT22 read blocks for hundreds of milliseconds, so the actuator state is
  // re-evaluated against a fresh clock here instead of waiting for the next
  // iteration. Without this, one sampling slot could be added to a run.
  serviceActuators(millis());

  // Keep an anchored cadence, but skip missed slots instead of taking several
  // DHT22 readings back-to-back after a long blocking operation.
  nextSampleAtMs += TB_TELEMETRY_INTERVAL_MS;
  if (static_cast<int32_t>(now - nextSampleAtMs) >= 0) {
    nextSampleAtMs = now + TB_TELEMETRY_INTERVAL_MS;
  }
}
