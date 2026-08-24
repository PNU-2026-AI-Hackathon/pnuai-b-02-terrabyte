// Unit tests for the pump hard interlocks G1-G3 and command-id de-duplication.
//
// There is no pump circuit yet, so this suite is currently the only evidence
// that the interlocks behave. It is written to cover exactly the cases a bench
// test cannot reach: a 10-minute cooldown, a full ring-buffer eviction, and the
// 49.7-day millis() rollover.
//
//   pio test -e native
//   g++ -std=gnu++17 -Wall -Wextra -o /tmp/guard \
//       ../../src/ActuatorGuard.cpp test_actuator_guard.cpp && /tmp/guard

#include "../../include/ActuatorGuard.h"
#include "../tb_assert.h"

namespace {

// Short, readable limits for the behavioural tests. The frozen defaults are
// asserted separately by testConfiguredLimitsMatchContract().
tb::GuardLimits testLimits() {
  tb::GuardLimits limits;
  limits.absMaxRuntimeMs = 30000;
  limits.minIntervalMs = 600000;
  limits.hostTimeoutMs = 3000;
  return limits;
}

// Wrapping arithmetic on the 32-bit millis() counter is intentional in the
// rollover tests, so it is spelled out instead of being an implicit narrowing.
constexpr uint32_t at(const uint32_t baseMs, const uint32_t offsetMs) {
  return static_cast<uint32_t>(baseMs + offsetMs);
}

// Runs the guard millisecond by millisecond with a live host, mirroring the
// Orange Pi's 1-second dead-man tick. Returns true when no stop occurred, so a
// test that is not about G3 does not have to assert once per millisecond.
bool ranWithoutStopping(tb::ActuatorGuard& guard, const uint32_t fromMs,
                        const uint32_t toMs) {
  for (uint32_t now = fromMs; now != toMs; ++now) {
    if ((now % 1000) == 0) {
      guard.noteHostActivity(now);
    }
    if (guard.tick(now).stopped) {
      return false;
    }
  }
  return true;
}

void testConfiguredLimitsMatchContract() {
  const tb::GuardLimits limits = tb::configuredGuardLimits();
  TB_CHECK_EQ(limits.absMaxRuntimeMs, 210000);
  TB_CHECK_EQ(limits.minIntervalMs, 600000);
  TB_CHECK_EQ(limits.hostTimeoutMs, 3000);

  // The firmware cooldown must stay under the server's 6h cooldown, otherwise
  // the firmware refuses commands the server approved.
  TB_CHECK(limits.minIntervalMs < 21600000UL);
  TB_CHECK(limits.absMaxRuntimeMs < limits.minIntervalMs);
}

// The cross-layer invariant this whole constant exists to satisfy.
//
// The server's dose ceiling is 200 mL and the measured flow is 500 mL / 510 s,
// so a maximum dose asks for 204 000 ms. If G1 were below that, every maximum
// dose would be silently truncated and reported as stop:"max_runtime" - the
// failure would look like a hardware fault rather than a misconfiguration.
// Both halves are asserted: the largest legitimate dose must pass unclamped,
// and something beyond the ceiling must still be clamped.
void testMaximumServerDoseRunsUnclamped() {
  tb::ActuatorGuard guard;  // the compiled-in contract, not the test limits

  const tb::PumpVerdict granted = guard.requestPump("MAXDOSE", 204000, 0);
  TB_CHECK(granted.accepted);
  TB_CHECK_EQ(granted.grantedMs, 204000);
  TB_CHECK(!granted.clampedByAbsMax);

  const tb::PumpStop stop = guard.tick(204000);
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kVolumeReached);
}

void testBeyondTheCeilingIsStillClamped() {
  tb::ActuatorGuard guard;

  const tb::PumpVerdict verdict = guard.requestPump("TOOLONG", 300000, 0);
  TB_CHECK(verdict.accepted);
  TB_CHECK_EQ(verdict.grantedMs, 210000);
  TB_CHECK(verdict.clampedByAbsMax);

  const tb::PumpStop stop = guard.tick(210000);
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kMaxRuntime);
}

void testFreshBootAcceptsImmediately() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(0), 0);
  TB_CHECK(!guard.pumpRunning());
  TB_CHECK_TEXT(guard.activeCommandId(), "");

  const tb::PumpVerdict verdict = guard.requestPump("01J8F3", 18000, 0);
  TB_CHECK(verdict.accepted);
  TB_CHECK_EQ(verdict.grantedMs, 18000);
  TB_CHECK(!verdict.clampedByAbsMax);
  TB_CHECK(guard.pumpRunning());
  TB_CHECK_TEXT(guard.activeCommandId(), "01J8F3");
}

// A run that gets its whole requested duration completed its dose.
void testFullRequestedRunCompletes() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("full", 18000, 1000).accepted);
  TB_CHECK(ranWithoutStopping(guard, 1001, 1000 + 18000));

  const tb::PumpStop early = guard.tick(1000 + 17999);
  TB_CHECK(!early.stopped);

  const tb::PumpStop stop = guard.tick(1000 + 18000);
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kVolumeReached);
  TB_CHECK_EQ(stop.runtimeMs, 18000);
  TB_CHECK(!guard.pumpRunning());

  // A stop event is reported exactly once.
  TB_CHECK(!guard.tick(1000 + 18001).stopped);
}

// G1: a command asking for more than the absolute maximum is clamped, and the
// clamp is what the completion reports.
void testG1ClampsOversizedRequest() {
  tb::ActuatorGuard guard(testLimits());
  const tb::PumpVerdict verdict = guard.requestPump("big", 60000, 0);
  TB_CHECK(verdict.accepted);
  TB_CHECK_EQ(verdict.grantedMs, 30000);
  TB_CHECK(verdict.clampedByAbsMax);
  TB_CHECK_EQ(guard.grantedRuntimeMs(), 30000);

  TB_CHECK(ranWithoutStopping(guard, 1, 30000));
  TB_CHECK(!guard.tick(29999).stopped);
  const tb::PumpStop stop = guard.tick(30000);
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kMaxRuntime);
  TB_CHECK_EQ(stop.runtimeMs, 30000);
}

// G1 cannot be relaxed by any request, however extreme.
void testG1CannotBeWidened() {
  tb::ActuatorGuard guard(testLimits());
  const tb::PumpVerdict verdict = guard.requestPump("max", 0xFFFFFFFFUL, 0);
  TB_CHECK(verdict.accepted);
  TB_CHECK_EQ(verdict.grantedMs, 30000);
}

// G2: measured from the last stop, not from the last start.
void testG2RejectsInsideCooldown() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("first", 10000, 0).accepted);
  const tb::PumpStop stop = guard.tick(10000);
  TB_CHECK(stop.stopped);

  const tb::PumpVerdict tooSoon = guard.requestPump("second", 10000, 10000 + 599999);
  TB_CHECK(!tooSoon.accepted);
  TB_CHECK(tooSoon.reason == tb::RejectReason::kCooldown);
  TB_CHECK(!guard.pumpRunning());

  const tb::PumpVerdict allowed = guard.requestPump("third", 10000, 10000 + 600000);
  TB_CHECK(allowed.accepted);
}

// pump_lockout_ms is a countdown. Emitting the configured interval instead is an
// easy mistake and would tell the server the pump is never available.
void testLockoutCountsDown() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("lock", 10000, 0).accepted);

  // While running, the lockout includes the remaining runtime: the cooldown has
  // not started counting yet.
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(0), 10000 + 600000);
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(4000), 6000 + 600000);

  TB_CHECK(guard.tick(10000).stopped);
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(10000), 600000);
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(10000 + 100000), 500000);
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(10000 + 599999), 1);
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(10000 + 600000), 0);
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(10000 + 900000), 0);

  // It is a remaining time, never the setting itself once time has passed.
  TB_CHECK(guard.pumpLockoutRemainingMs(10000 + 100000) !=
           guard.limits().minIntervalMs);
}

void testDuplicateIdIsRefused() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("01J8F3", 10000, 0).accepted);
  TB_CHECK(guard.tick(10000).stopped);

  // Refused even once the cooldown has fully elapsed.
  const tb::PumpVerdict repeat = guard.requestPump("01J8F3", 10000, 10000 + 900000);
  TB_CHECK(!repeat.accepted);
  TB_CHECK(repeat.reason == tb::RejectReason::kDuplicate);
}

// A redelivery of a command that never ran is re-evaluated, not remembered.
// Otherwise a cooldown rejection would poison the id for good.
void testRejectedIdIsNotRemembered() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("first", 10000, 0).accepted);
  TB_CHECK(guard.tick(10000).stopped);

  const tb::PumpVerdict rejected = guard.requestPump("later", 10000, 20000);
  TB_CHECK(!rejected.accepted);
  TB_CHECK(rejected.reason == tb::RejectReason::kCooldown);

  const tb::PumpVerdict retried = guard.requestPump("later", 10000, 10000 + 600000);
  TB_CHECK(retried.accepted);
}

// The ring holds eight ids; the ninth accepted command evicts the oldest.
void testRingBufferForgetsAfterEightIds() {
  tb::ActuatorGuard guard(testLimits());
  const char* ids[9] = {"id0", "id1", "id2", "id3", "id4",
                        "id5", "id6", "id7", "id8"};
  uint32_t now = 0;
  for (uint8_t index = 0; index < 9; ++index) {
    TB_CHECK(guard.requestPump(ids[index], 1000, now).accepted);
    TB_CHECK(guard.tick(now + 1000).stopped);
    now += 1000 + 600000;
  }

  // "id0" was pushed out by "id8" and is accepted again.
  TB_CHECK(guard.requestPump("id0", 1000, now).accepted);
  TB_CHECK(guard.tick(now + 1000).stopped);
  now += 1000 + 600000;

  // "id8" is still remembered.
  const tb::PumpVerdict recent = guard.requestPump("id8", 1000, now);
  TB_CHECK(!recent.accepted);
  TB_CHECK(recent.reason == tb::RejectReason::kDuplicate);
}

void testBusyWhileRunning() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("running", 20000, 0).accepted);

  const tb::PumpVerdict overlapping = guard.requestPump("other", 5000, 1000);
  TB_CHECK(!overlapping.accepted);
  TB_CHECK(overlapping.reason == tb::RejectReason::kBusy);

  // The refused command must not disturb the run in progress.
  TB_CHECK(guard.pumpRunning());
  TB_CHECK_TEXT(guard.activeCommandId(), "running");
  TB_CHECK_EQ(guard.grantedRuntimeMs(), 20000);
}

void testUnusableRequests() {
  tb::ActuatorGuard guard(testLimits());

  const tb::PumpVerdict noId = guard.requestPump("", 10000, 0);
  TB_CHECK(!noId.accepted);
  TB_CHECK(noId.reason == tb::RejectReason::kBadRequest);

  const tb::PumpVerdict nullId = guard.requestPump(nullptr, 10000, 0);
  TB_CHECK(!nullId.accepted);
  TB_CHECK(nullId.reason == tb::RejectReason::kBadRequest);

  const tb::PumpVerdict zeroRun = guard.requestPump("zero", 0, 0);
  TB_CHECK(!zeroRun.accepted);
  TB_CHECK(zeroRun.reason == tb::RejectReason::kBadRequest);

  // An id longer than the buffer is refused rather than truncated: a truncated
  // id would collide with a different command in the ring and in the ack.
  const tb::PumpVerdict longId =
      guard.requestPump("012345678901234567890123456789", 10000, 0);
  TB_CHECK(!longId.accepted);
  TB_CHECK(longId.reason == tb::RejectReason::kBadRequest);

  // No unusable request may leave the pump running.
  TB_CHECK(!guard.pumpRunning());

  // A full 26-character ULID still fits.
  TB_CHECK(guard.requestPump("01J8F3QK2M7X9ZB4CDEFGHJKMN", 10000, 0).accepted);
  TB_CHECK(guard.pumpRunning());
}

// G3: silence from the host stops a run in progress.
void testG3WatchdogStopsRun() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("dead", 30000, 20).accepted);

  TB_CHECK(!guard.tick(20 + 2999).stopped);
  const tb::PumpStop stop = guard.tick(20 + 3000);
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kWatchdog);
  TB_CHECK_EQ(stop.runtimeMs, 3000);
  TB_CHECK(!guard.pumpRunning());

  // The abort still arms the cooldown.
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(20 + 3000), 600000);
}

// A live host tick keeps a long run going all the way to its deadline. Without
// this case, a watchdog that fired unconditionally would still pass every other
// G3 assertion.
void testG3HostTicksKeepRunAlive() {
  tb::ActuatorGuard guard(testLimits());
  TB_CHECK(guard.requestPump("alive", 45000, 0).accepted);
  TB_CHECK(ranWithoutStopping(guard, 1, 30000));

  const tb::PumpStop stop = guard.tick(30000);
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kMaxRuntime);
  TB_CHECK_EQ(stop.runtimeMs, 30000);
}

// The watchdog only guards a run in progress. An idle board with no host must
// not manufacture stop events, which would reset the cooldown baseline forever.
void testG3IdleBoardProducesNoEvents() {
  tb::ActuatorGuard guard(testLimits());
  for (uint32_t now = 0; now < 20000; now += 500) {
    TB_CHECK(!guard.tick(now).stopped);
  }
  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(20000), 0);
  TB_CHECK(guard.requestPump("after-idle", 1000, 20000).accepted);
}

// millis() wraps after 49.7 days. Every window here has to survive that. A raw
// `now > deadline` comparison passes all the tests above and fails only here.
void testRolloverDuringRun() {
  tb::ActuatorGuard guard(testLimits());
  const uint32_t start = 0xFFFFFFFFUL - 10000UL;  // 10s before the wrap

  TB_CHECK(guard.requestPump("wrap", 45000, start).accepted);
  TB_CHECK(at(start, 29999) < start);  // the wrap really happened
  TB_CHECK(ranWithoutStopping(guard, at(start, 1), at(start, 30000)));

  const tb::PumpStop stop = guard.tick(at(start, 30000));
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kMaxRuntime);
  TB_CHECK_EQ(stop.runtimeMs, 30000);
}

void testRolloverDuringCooldown() {
  tb::ActuatorGuard guard(testLimits());
  const uint32_t start = 0xFFFFFFFFUL - 1000UL;
  const uint32_t stopAt = at(start, 1000);  // exactly at the wrap

  TB_CHECK(guard.requestPump("wrap-run", 1000, start).accepted);
  guard.noteHostActivity(stopAt);
  TB_CHECK(guard.tick(stopAt).stopped);

  TB_CHECK_EQ(guard.pumpLockoutRemainingMs(at(stopAt, 100000)), 500000);

  const tb::PumpVerdict tooSoon =
      guard.requestPump("wrap-next", 1000, at(stopAt, 599999));
  TB_CHECK(!tooSoon.accepted);
  TB_CHECK(tooSoon.reason == tb::RejectReason::kCooldown);

  TB_CHECK(guard.requestPump("wrap-ok", 1000, at(stopAt, 600000)).accepted);
}

void testRolloverDuringWatchdogWindow() {
  tb::ActuatorGuard guard(testLimits());
  const uint32_t start = 0xFFFFFFFFUL - 500UL;

  TB_CHECK(guard.requestPump("wrap-dead", 30000, start).accepted);
  TB_CHECK(!guard.tick(at(start, 2999)).stopped);

  const tb::PumpStop stop = guard.tick(at(start, 3000));
  TB_CHECK(stop.stopped);
  TB_CHECK(stop.cause == tb::StopCause::kWatchdog);
  TB_CHECK_EQ(stop.runtimeMs, 3000);
}

}  // namespace

int main() {
  testConfiguredLimitsMatchContract();
  testMaximumServerDoseRunsUnclamped();
  testBeyondTheCeilingIsStillClamped();
  testFreshBootAcceptsImmediately();
  testFullRequestedRunCompletes();
  testG1ClampsOversizedRequest();
  testG1CannotBeWidened();
  testG2RejectsInsideCooldown();
  testLockoutCountsDown();
  testDuplicateIdIsRefused();
  testRejectedIdIsNotRemembered();
  testRingBufferForgetsAfterEightIds();
  testBusyWhileRunning();
  testUnusableRequests();
  testG3WatchdogStopsRun();
  testG3HostTicksKeepRunAlive();
  testG3IdleBoardProducesNoEvents();
  testRolloverDuringRun();
  testRolloverDuringCooldown();
  testRolloverDuringWatchdogWindow();
  return tbtest::summary("test_actuator_guard");
}
