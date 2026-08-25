// Unit tests for the grow-light latch and its dead-man.
//
// There is no light circuit wired yet, so this suite is currently the only
// evidence that the latch behaves. It is written to cover what a bench test
// cannot reach: a five-minute timeout, and the 49.7-day millis() rollover.
//
//   pio test -e native
//   g++ -std=gnu++17 -Wall -Wextra -o /tmp/led \
//       ../../src/ActuatorGuard.cpp ../../src/LedGuard.cpp \
//       test_led_guard.cpp && /tmp/led

#include "../../include/ActuatorGuard.h"
#include "../../include/LedGuard.h"
#include "../tb_assert.h"

namespace {

// Short, readable limits for the behavioural tests. The frozen default is
// asserted separately by testConfiguredLimitsMatchContract().
tb::LedLimits testLimits() {
  tb::LedLimits limits;
  limits.hostTimeoutMs = 30000;
  return limits;
}

constexpr uint32_t at(const uint32_t baseMs, const uint32_t offsetMs) {
  return static_cast<uint32_t>(baseMs + offsetMs);
}

void testConfiguredLimitsMatchContract() {
  const tb::LedLimits limits = tb::configuredLedLimits();
  TB_CHECK_EQ(limits.hostTimeoutMs, 300000);

  // The light window must outlast the pump's. The gateway ticks at a cadence
  // that sits between the two, so that the silence which stops an orphaned pump
  // run still happens while the light stays lit. Collapse the two windows and
  // that silence disappears, because G3 counts bytes and cannot tell which
  // actuator they were meant for.
  const tb::GuardLimits pump = tb::configuredGuardLimits();
  TB_CHECK(limits.hostTimeoutMs > pump.hostTimeoutMs);

  // Below a minute the light would chatter on ordinary link jitter.
  TB_CHECK(limits.hostTimeoutMs >= 60000UL);
}

void testFreshBootIsDark() {
  tb::LedGuard guard(testLimits());
  TB_CHECK(!guard.ledOn());
  TB_CHECK_EQ(guard.onDurationMs(0), 0);
  TB_CHECK_EQ(guard.onDurationMs(999999), 0);
}

void testLatchOnAndOff() {
  tb::LedGuard guard(testLimits());

  const tb::LedVerdict lit = guard.request(true, 1000);
  TB_CHECK(lit.accepted);
  TB_CHECK(lit.on);
  TB_CHECK(lit.changed);
  TB_CHECK(guard.ledOn());
  TB_CHECK_EQ(guard.onDurationMs(4000), 3000);

  const tb::LedVerdict dark = guard.request(false, 5000);
  TB_CHECK(dark.accepted);
  TB_CHECK(!dark.on);
  TB_CHECK(dark.changed);
  TB_CHECK(!guard.ledOn());
  TB_CHECK_EQ(guard.onDurationMs(6000), 0);
}

// A latch is idempotent: there is nothing to de-duplicate, so re-asserting the
// state already held is a no-op rather than a rejection.
void testReassertingIsANoOp() {
  tb::LedGuard guard(testLimits());
  TB_CHECK(guard.request(true, 1000).changed);

  const tb::LedVerdict again = guard.request(true, 9000);
  TB_CHECK(again.accepted);
  TB_CHECK(again.on);
  TB_CHECK(!again.changed);
  TB_CHECK(guard.ledOn());

  // The on-duration clock must not restart. The gateway re-sends on reconnect,
  // and a light that has burned for eight seconds has burned for eight seconds
  // however often it was told so.
  TB_CHECK_EQ(guard.onDurationMs(9000), 8000);
}

void testReassertingOffIsAlsoANoOp() {
  tb::LedGuard guard(testLimits());
  const tb::LedVerdict verdict = guard.request(false, 1000);
  TB_CHECK(verdict.accepted);
  TB_CHECK(!verdict.on);
  TB_CHECK(!verdict.changed);
  TB_CHECK(!guard.tick(2000).stopped);
}

// A commanded off is not a stop event: the host already knows, and reporting it
// through tick() would ack the same transition twice.
void testCommandedOffProducesNoStopEvent() {
  tb::LedGuard guard(testLimits());
  guard.request(true, 0);
  guard.request(false, 5000);
  TB_CHECK(!guard.tick(5000).stopped);
  TB_CHECK(!guard.tick(6000).stopped);
}

// A dead-man guards a thing that is on. An unlit board may sit silent
// indefinitely without that meaning anything is wrong.
void testDarkBoardNeverTriggersTheWatchdog() {
  tb::LedGuard guard(testLimits());
  for (uint32_t now = 0; now <= 300000; now += 1000) {
    TB_CHECK(!guard.tick(now).stopped);
  }
}

void testWatchdogFiresExactlyOnceAtTheBoundary() {
  tb::LedGuard guard(testLimits());
  guard.request(true, 1000);

  TB_CHECK(!guard.tick(at(1000, 29999)).stopped);

  const tb::LedStopEvent stop = guard.tick(at(1000, 30000));
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::LedStop::kWatchdog);
  TB_CHECK_EQ(stop.onDurationMs, 30000);
  TB_CHECK(!guard.ledOn());

  // Reported exactly once per lit period.
  TB_CHECK(!guard.tick(at(1000, 31000)).stopped);
  TB_CHECK(!guard.tick(at(1000, 90000)).stopped);
}

// The cadence the gateway will actually use: a tick well inside the window,
// far slower than the pump's, held for a long stretch.
void testHostTicksKeepTheLightOn() {
  tb::LedGuard guard(testLimits());
  guard.request(true, 0);

  for (uint32_t now = 10000; now <= 1800000; now += 10000) {
    guard.noteHostActivity(now);
    TB_CHECK(!guard.tick(now).stopped);
  }
  TB_CHECK(guard.ledOn());
  TB_CHECK_EQ(guard.onDurationMs(1800000), 1800000);
}

// Switching on after a long silence must not inherit the stale activity stamp
// and be stopped on the very next tick.
void testCommandItselfProvesTheHostIsAlive() {
  tb::LedGuard guard(testLimits());
  guard.request(true, 0);
  TB_CHECK(guard.tick(30000).stopped);

  // A long quiet stretch, then a fresh command.
  const tb::LedVerdict relit = guard.request(true, 500000);
  TB_CHECK(relit.changed);
  TB_CHECK(guard.ledOn());
  TB_CHECK(!guard.tick(500000).stopped);
  TB_CHECK(!guard.tick(at(500000, 29999)).stopped);
  TB_CHECK(guard.tick(at(500000, 30000)).stopped);
}

// millis() wraps after 49.7 days. A raw `now > then` comparison inverts across
// the wrap, so the light would either never time out or stop instantly. No
// bench test reaches this.
void testRolloverDuringLitPeriod() {
  tb::LedGuard guard(testLimits());
  const uint32_t start = 0xFFFFFFFFUL - 500UL;

  guard.request(true, start);
  TB_CHECK(guard.ledOn());

  // Across the wrap, with the host alive.
  for (uint32_t offset = 1000; offset <= 120000; offset += 1000) {
    guard.noteHostActivity(at(start, offset));
    TB_CHECK(!guard.tick(at(start, offset)).stopped);
  }
  TB_CHECK_EQ(guard.onDurationMs(at(start, 120000)), 120000);

  // Then let it go quiet.
  const uint32_t quietFrom = at(start, 120000);
  TB_CHECK(!guard.tick(at(quietFrom, 29999)).stopped);
  const tb::LedStopEvent stop = guard.tick(at(quietFrom, 30000));
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::LedStop::kWatchdog);
  TB_CHECK_EQ(stop.onDurationMs, 150000);
}

// The light has no G1 and no G2 by design, so a very long lit period is not an
// error. This pins that absence: at the real photoperiod length nothing stops
// it but the dead-man.
void testNoAbsoluteMaximumOnTimeInFirmware() {
  tb::LedGuard guard(testLimits());
  guard.request(true, 0);

  const uint32_t sixteenHoursMs = 16UL * 60UL * 60UL * 1000UL;
  for (uint32_t now = 10000; now <= sixteenHoursMs; now += 10000) {
    guard.noteHostActivity(now);
    TB_CHECK(!guard.tick(now).stopped);
  }
  TB_CHECK(guard.ledOn());
}

}  // namespace

int main() {
  testConfiguredLimitsMatchContract();
  testFreshBootIsDark();
  testLatchOnAndOff();
  testReassertingIsANoOp();
  testReassertingOffIsAlsoANoOp();
  testCommandedOffProducesNoStopEvent();
  testDarkBoardNeverTriggersTheWatchdog();
  testWatchdogFiresExactlyOnceAtTheBoundary();
  testHostTicksKeepTheLightOn();
  testCommandItselfProvesTheHostIsAlive();
  testRolloverDuringLitPeriod();
  testNoAbsoluteMaximumOnTimeInFirmware();
  return tbtest::summary("test_led_guard");
}
