// Unit tests for the inbound serial parser.
//
//   pio test -e native
//   g++ -std=gnu++17 -Wall -Wextra -o /tmp/parser \
//       ../../src/ActuatorGuard.cpp ../../src/CommandParser.cpp \
//       test_command_parser.cpp && /tmp/parser

#include "../../include/CommandParser.h"
#include "../tb_assert.h"

namespace {

// The exact line from docs/design/edge_ai_hardening.md.
void testContractExample() {
  const tb::InboundMessage message = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"01J8F3\",\"act\":\"pump\",\"ms\":18000,\"ml\":120}");
  TB_CHECK(message.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_TEXT(message.id, "01J8F3");
  TB_CHECK_EQ(message.runtimeMs, 18000);
  TB_CHECK_EQ(message.volumeMl, 120);
}

void testKeepAlive() {
  const tb::InboundMessage message = tb::parseInboundLine("{\"t\":\"ka\"}");
  TB_CHECK(message.kind == tb::InboundKind::kKeepAlive);
  TB_CHECK_TEXT(message.id, "");
  TB_CHECK_EQ(message.runtimeMs, 0);
}

// The two message families use different envelope keys. A telemetry record fed
// back into the parser must not look like anything: `"t"` has to match with its
// quotes, or "message_type" and "air_temperature_c" would both trip it.
void testOutboundTelemetryIsNotMistakenForACommand() {
  const tb::InboundMessage telemetry = tb::parseInboundLine(
      "{\"message_type\":\"telemetry\",\"protocol_version\":1,\"node_id\":"
      "\"terrabyte-node-001\",\"sequence\":42,\"uptime_ms\":215000,"
      "\"air_temperature_c\":24.30,\"relative_humidity_pct\":58.10,"
      "\"ppfd_umol_m2_s\":421.75,\"actuators\":{\"pump\":0},"
      "\"pump_lockout_ms\":420000}");
  TB_CHECK(telemetry.kind == tb::InboundKind::kIgnored);

  const tb::InboundMessage ack = tb::parseInboundLine(
      "{\"t\":\"ack\",\"id\":\"01J8F3\",\"ph\":\"accepted\"}");
  TB_CHECK(ack.kind == tb::InboundKind::kIgnored);

  const tb::InboundMessage hello = tb::parseInboundLine(
      "{\"message_type\":\"hello\",\"protocol_version\":1,\"ready\":true}");
  TB_CHECK(hello.kind == tb::InboundKind::kIgnored);
}

void testKeyOrderAndWhitespaceDoNotMatter() {
  const tb::InboundMessage message = tb::parseInboundLine(
      "{ \"ms\" : 9000 , \"act\" : \"pump\" , \"t\" : \"cmd\" , \"ml\" : 40 , "
      "\"id\" : \"abc\" }");
  TB_CHECK(message.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_TEXT(message.id, "abc");
  TB_CHECK_EQ(message.runtimeMs, 9000);
  TB_CHECK_EQ(message.volumeMl, 40);
}

// A command carrying an id but nothing executable must still be rejectable, so
// the id survives the failure.
void testUnusableCommandKeepsItsId() {
  const tb::InboundMessage unknownActuator = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"01J8F3\",\"act\":\"valve\",\"ms\":1000}");
  TB_CHECK(unknownActuator.kind == tb::InboundKind::kUnusableCommand);
  TB_CHECK_TEXT(unknownActuator.id, "01J8F3");

  const tb::InboundMessage noRuntime = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"01J8F3\",\"act\":\"pump\",\"ml\":120}");
  TB_CHECK(noRuntime.kind == tb::InboundKind::kUnusableCommand);
  TB_CHECK_TEXT(noRuntime.id, "01J8F3");

  const tb::InboundMessage zeroRuntime = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"01J8F3\",\"act\":\"pump\",\"ms\":0}");
  TB_CHECK(zeroRuntime.kind == tb::InboundKind::kUnusableCommand);
  TB_CHECK_TEXT(zeroRuntime.id, "01J8F3");
  TB_CHECK_EQ(zeroRuntime.runtimeMs, 0);
}

void testCommandWithoutIdIsUnusable() {
  const tb::InboundMessage message =
      tb::parseInboundLine("{\"t\":\"cmd\",\"act\":\"pump\",\"ms\":18000}");
  TB_CHECK(message.kind == tb::InboundKind::kUnusableCommand);
  TB_CHECK_TEXT(message.id, "");

  const tb::InboundMessage empty = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"\",\"act\":\"pump\",\"ms\":18000}");
  TB_CHECK(empty.kind == tb::InboundKind::kUnusableCommand);
  TB_CHECK_TEXT(empty.id, "");
}

// A full 26-character ULID fits; anything longer is refused rather than
// truncated, because a truncated id would be acked under the wrong name.
void testIdLengthBoundary() {
  const tb::InboundMessage ulid = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"01J8F3QK2M7X9ZB4CDEFGHJKMN\",\"act\":\"pump\","
      "\"ms\":18000}");
  TB_CHECK(ulid.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_TEXT(ulid.id, "01J8F3QK2M7X9ZB4CDEFGHJKMN");

  const tb::InboundMessage tooLong = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"01J8F3QK2M7X9ZB4CDEFGHJKMNPQ\",\"act\":\"pump\","
      "\"ms\":18000}");
  TB_CHECK(tooLong.kind == tb::InboundKind::kUnusableCommand);
  TB_CHECK_TEXT(tooLong.id, "");
}

// `ml` is optional: the run is timed, not metered.
void testVolumeIsOptionalAndSaturates() {
  const tb::InboundMessage noVolume = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"novol\",\"act\":\"pump\",\"ms\":5000}");
  TB_CHECK(noVolume.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_EQ(noVolume.volumeMl, 0);

  const tb::InboundMessage huge = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"bigvol\",\"act\":\"pump\",\"ms\":5000,"
      "\"ml\":999999}");
  TB_CHECK(huge.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_EQ(huge.volumeMl, 65535);
}

// An absurd duration must saturate rather than wrap: wrapping could turn a
// 40-day request into a short one and hide the mistake instead of letting G1
// clamp it visibly.
void testRuntimeSaturatesInsteadOfWrapping() {
  const tb::InboundMessage message = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"huge\",\"act\":\"pump\",\"ms\":99999999999}");
  TB_CHECK(message.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_EQ(message.runtimeMs, 0xFFFFFFFFUL);
}

void testGarbageIsIgnored() {
  TB_CHECK(tb::parseInboundLine("").kind == tb::InboundKind::kIgnored);
  TB_CHECK(tb::parseInboundLine("w30").kind == tb::InboundKind::kIgnored);
  TB_CHECK(tb::parseInboundLine("{").kind == tb::InboundKind::kIgnored);
  TB_CHECK(tb::parseInboundLine("{\"t\":").kind == tb::InboundKind::kIgnored);
  TB_CHECK(tb::parseInboundLine("{\"t\":\"cm").kind == tb::InboundKind::kIgnored);
  TB_CHECK(tb::parseInboundLine("{\"t\" \"cmd\"}").kind ==
           tb::InboundKind::kIgnored);
  TB_CHECK(tb::parseInboundLine(nullptr).kind == tb::InboundKind::kIgnored);
}

// The parser hands `ms` straight to the guard, which is where the bound lives.
// The expectation is derived from the guard's own limit rather than spelled
// out, so tuning G1 does not break a test that is about responsibility rather
// than about the value; testConfiguredLimitsMatchContract pins the value.
void testParserDoesNotEnforceLimits() {
  const tb::InboundMessage message = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"long\",\"act\":\"pump\",\"ms\":900000}");
  TB_CHECK(message.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_EQ(message.runtimeMs, 900000);

  tb::ActuatorGuard guard;
  const uint32_t ceiling = guard.limits().absMaxRuntimeMs;
  TB_CHECK(message.runtimeMs > ceiling);

  const tb::PumpVerdict verdict =
      guard.requestPump(message.id, message.runtimeMs, 0);
  TB_CHECK(verdict.accepted);
  TB_CHECK(verdict.clampedByAbsMax);
  TB_CHECK_EQ(verdict.grantedMs, ceiling);
}

// The light verb. `on:0` must survive as a command, not be mistaken for the
// pump path's "a zero duration is unusable" rule.
void testLedLatchOn() {
  const tb::InboundMessage message = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"led-00000012\",\"act\":\"led\",\"on\":1}");
  TB_CHECK(message.kind == tb::InboundKind::kLedCommand);
  TB_CHECK_TEXT(message.id, "led-00000012");
  TB_CHECK(message.ledOn);
}

void testLedLatchOffIsAValidCommand() {
  const tb::InboundMessage message = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"led-00000013\",\"act\":\"led\",\"on\":0}");
  TB_CHECK(message.kind == tb::InboundKind::kLedCommand);
  TB_CHECK(!message.ledOn);
}

void testLedWithoutOnKeyIsUnusable() {
  const tb::InboundMessage message =
      tb::parseInboundLine("{\"t\":\"cmd\",\"id\":\"led-1\",\"act\":\"led\"}");
  TB_CHECK(message.kind == tb::InboundKind::kUnusableCommand);
  // The id survives so the rejection can still be acked.
  TB_CHECK_TEXT(message.id, "led-1");
}

// readUnsigned saturates, so a narrow ceiling would silently turn any of these
// into a confident 1. Undefined values are refused instead of guessed.
void testLedRejectsValuesOutsideTheContract() {
  const char* const lines[] = {
      "{\"t\":\"cmd\",\"id\":\"led-1\",\"act\":\"led\",\"on\":2}",
      "{\"t\":\"cmd\",\"id\":\"led-1\",\"act\":\"led\",\"on\":7}",
      "{\"t\":\"cmd\",\"id\":\"led-1\",\"act\":\"led\",\"on\":99}",
      "{\"t\":\"cmd\",\"id\":\"led-1\",\"act\":\"led\",\"on\":-1}",
      "{\"t\":\"cmd\",\"id\":\"led-1\",\"act\":\"led\",\"on\":true}",
      "{\"t\":\"cmd\",\"id\":\"led-1\",\"act\":\"led\",\"on\":\"yes\"}",
  };
  for (const char* line : lines) {
    TB_CHECK(tb::parseInboundLine(line).kind ==
             tb::InboundKind::kUnusableCommand);
  }
}

// Without an id there is no way to address an ack, so the command cannot run.
void testLedWithoutIdIsUnusable() {
  const tb::InboundMessage message =
      tb::parseInboundLine("{\"t\":\"cmd\",\"act\":\"led\",\"on\":1}");
  TB_CHECK(message.kind == tb::InboundKind::kUnusableCommand);
  TB_CHECK_TEXT(message.id, "");
}

// A stray `on` must not change how a pump command is read.
void testPumpCommandIgnoresAStrayOnKey() {
  const tb::InboundMessage message = tb::parseInboundLine(
      "{\"t\":\"cmd\",\"id\":\"P1\",\"act\":\"pump\",\"ms\":18000,\"on\":1}");
  TB_CHECK(message.kind == tb::InboundKind::kPumpCommand);
  TB_CHECK_EQ(message.runtimeMs, 18000);
  TB_CHECK(!message.ledOn);
}

}  // namespace

int main() {
  testContractExample();
  testKeepAlive();
  testOutboundTelemetryIsNotMistakenForACommand();
  testKeyOrderAndWhitespaceDoNotMatter();
  testUnusableCommandKeepsItsId();
  testCommandWithoutIdIsUnusable();
  testIdLengthBoundary();
  testVolumeIsOptionalAndSaturates();
  testRuntimeSaturatesInsteadOfWrapping();
  testGarbageIsIgnored();
  testParserDoesNotEnforceLimits();
  testLedLatchOn();
  testLedLatchOffIsAValidCommand();
  testLedWithoutOnKeyIsUnusable();
  testLedRejectsValuesOutsideTheContract();
  testLedWithoutIdIsUnusable();
  testPumpCommandIgnoresAStrayOnKey();
  return tbtest::summary("test_command_parser");
}
