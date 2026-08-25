#include "../include/ActuatorGuard.h"

#include "../include/TelemetryConfig.h"

// Every elapsed-time test in this file is an unsigned subtraction of the form
// `now - then >= window`. millis() wraps after 49.7 days, and a raw `now > then`
// comparison silently inverts across that wrap: the pump would either never
// reach its deadline or stop instantly, depending on the direction. Unsigned
// subtraction is exact across one wrap, so the form is not a style preference.
// Do not introduce a `>` or `<` between two raw timestamps here.

namespace tb {
namespace {

constexpr uint32_t kFnvOffsetBasis = 2166136261UL;
constexpr uint32_t kFnvPrime = 16777619UL;

void copyCommandId(char* destination, const char* source) {
  size_t index = 0;
  if (source != nullptr) {
    while (source[index] != '\0' && index + 1 < kCommandIdCapacity) {
      destination[index] = source[index];
      ++index;
    }
  }
  destination[index] = '\0';
}

bool isUsableCommandId(const char* commandId) {
  if (commandId == nullptr || commandId[0] == '\0') {
    return false;
  }
  size_t length = 0;
  while (commandId[length] != '\0') {
    ++length;
    if (length >= kCommandIdCapacity) {
      return false;
    }
  }
  return true;
}

}  // namespace

uint32_t commandIdDigest(const char* commandId) {
  uint32_t digest = kFnvOffsetBasis;
  if (commandId == nullptr) {
    return digest;
  }
  for (size_t index = 0; commandId[index] != '\0'; ++index) {
    digest ^= static_cast<uint8_t>(commandId[index]);
    digest *= kFnvPrime;
  }
  return digest;
}

GuardLimits configuredGuardLimits() {
  GuardLimits limits;
  limits.absMaxRuntimeMs = TB_PUMP_ABS_MAX_MS;
  limits.minIntervalMs = TB_PUMP_MIN_INTERVAL_MS;
  limits.hostTimeoutMs = TB_HOST_TIMEOUT_MS;
  return limits;
}

ActuatorGuard::ActuatorGuard() : ActuatorGuard(configuredGuardLimits()) {}

ActuatorGuard::ActuatorGuard(const GuardLimits& limits)
    : limits_(limits),
      idRing_(),
      idRingCount_(0),
      idRingNext_(0),
      activeCommandId_(),
      runStartedAtMs_(0),
      grantedMs_(0),
      lastHostActivityAtMs_(0),
      lastStopAtMs_(0),
      pumpRunning_(false),
      clampedByAbsMax_(false),
      // A fresh boot imposes no cooldown. G2 is defined as "since the last
      // stop", and after a reset there is no last stop to measure from. The
      // cost is that a reset mid-run forgets the cooldown, so a resetting board
      // could be re-commanded early; G1 still bounds every individual run and
      // the server's 6h cooldown remains in force. Persisting the last stop to
      // EEPROM is deferred, not overlooked.
      hasStopped_(false) {}

bool ActuatorGuard::isDuplicate(const uint32_t digest) const {
  for (uint8_t index = 0; index < idRingCount_; ++index) {
    if (idRing_[index] == digest) {
      return true;
    }
  }
  return false;
}

void ActuatorGuard::remember(const uint32_t digest) {
  idRing_[idRingNext_] = digest;
  idRingNext_ = static_cast<uint8_t>((idRingNext_ + 1) % kCommandIdRingSize);
  if (idRingCount_ < kCommandIdRingSize) {
    ++idRingCount_;
  }
}

PumpVerdict ActuatorGuard::requestPump(const char* commandId,
                                       const uint32_t requestedMs,
                                       const uint32_t nowMs) {
  PumpVerdict verdict;
  verdict.accepted = false;
  verdict.reason = RejectReason::kNone;
  verdict.grantedMs = 0;
  verdict.clampedByAbsMax = false;

  if (!isUsableCommandId(commandId) || requestedMs == 0) {
    verdict.reason = RejectReason::kBadRequest;
    return verdict;
  }

  const uint32_t digest = commandIdDigest(commandId);

  // Duplicate is checked before the run-state and cooldown gates so that a
  // redelivered command gets the answer that explains itself, rather than the
  // incidental `busy` or `cooldown` caused by its own first delivery.
  if (isDuplicate(digest)) {
    verdict.reason = RejectReason::kDuplicate;
    return verdict;
  }

  if (pumpRunning_) {
    verdict.reason = RejectReason::kBusy;
    return verdict;
  }

  if (hasStopped_ && (nowMs - lastStopAtMs_) < limits_.minIntervalMs) {
    verdict.reason = RejectReason::kCooldown;
    return verdict;
  }

  // G1. Clamping rather than rejecting keeps a mis-scaled request useful, and
  // the clamp is reported at completion as stop:"max_runtime".
  uint32_t grantedMs = requestedMs;
  bool clamped = false;
  if (grantedMs > limits_.absMaxRuntimeMs) {
    grantedMs = limits_.absMaxRuntimeMs;
    clamped = true;
  }

  // Only accepted ids enter the ring. A rejected command never ran, so the ring
  // has nothing to protect against, and re-evaluating a redelivery is safe:
  // nothing about the gate that refused it has changed. A redelivery arriving
  // late enough for the cooldown to have lapsed is stopped upstream by the
  // 2-minute TTL, which is the layer that owns wall-clock decisions.
  remember(digest);
  copyCommandId(activeCommandId_, commandId);
  runStartedAtMs_ = nowMs;
  grantedMs_ = grantedMs;
  clampedByAbsMax_ = clamped;
  pumpRunning_ = true;

  // The command itself is host traffic, so the dead-man window starts now
  // instead of inheriting whatever silence preceded the command.
  lastHostActivityAtMs_ = nowMs;

  verdict.accepted = true;
  verdict.grantedMs = grantedMs;
  verdict.clampedByAbsMax = clamped;
  return verdict;
}

PumpStop ActuatorGuard::stopPump(const StopCause cause, const uint32_t nowMs,
                                 const uint32_t runtimeMs) {
  pumpRunning_ = false;
  lastStopAtMs_ = nowMs;
  hasStopped_ = true;

  PumpStop stop;
  stop.stopped = true;
  stop.cause = cause;
  stop.runtimeMs = runtimeMs;
  return stop;
}

PumpStop ActuatorGuard::tick(const uint32_t nowMs) {
  PumpStop stop;
  stop.stopped = false;
  stop.cause = StopCause::kNone;
  stop.runtimeMs = 0;

  if (!pumpRunning_) {
    return stop;
  }

  const uint32_t elapsedMs = nowMs - runStartedAtMs_;

  // The deadline is checked before the watchdog. Reaching it means the granted
  // dose was delivered, and a loop iteration that arrived late should not
  // retroactively relabel a finished run as an abort.
  if (elapsedMs >= grantedMs_) {
    return stopPump(
        clampedByAbsMax_ ? StopCause::kMaxRuntime : StopCause::kVolumeReached,
        nowMs, elapsedMs);
  }

  // G3.
  if ((nowMs - lastHostActivityAtMs_) >= limits_.hostTimeoutMs) {
    return stopPump(StopCause::kWatchdog, nowMs, elapsedMs);
  }

  return stop;
}

void ActuatorGuard::noteHostActivity(const uint32_t nowMs) {
  lastHostActivityAtMs_ = nowMs;
}

uint32_t ActuatorGuard::pumpLockoutRemainingMs(const uint32_t nowMs) const {
  if (pumpRunning_) {
    const uint32_t elapsedMs = nowMs - runStartedAtMs_;
    const uint32_t remainingRunMs =
        elapsedMs >= grantedMs_ ? 0 : grantedMs_ - elapsedMs;
    return remainingRunMs + limits_.minIntervalMs;
  }

  if (!hasStopped_) {
    return 0;
  }

  const uint32_t sinceStopMs = nowMs - lastStopAtMs_;
  if (sinceStopMs >= limits_.minIntervalMs) {
    return 0;
  }
  return limits_.minIntervalMs - sinceStopMs;
}

}  // namespace tb
