#include "../include/LedGuard.h"

#include "../include/TelemetryConfig.h"

// Every elapsed-time test here is an unsigned subtraction of the form
// `now - then >= window`, for the same reason ActuatorGuard.cpp gives: millis()
// wraps after 49.7 days and a raw `now > then` comparison silently inverts
// across the wrap. Do not introduce a `>` or `<` between two raw timestamps.

namespace tb {

LedLimits configuredLedLimits() {
  LedLimits limits;
  limits.hostTimeoutMs = TB_LED_HOST_TIMEOUT_MS;
  return limits;
}

LedGuard::LedGuard() : LedGuard(configuredLedLimits()) {}

LedGuard::LedGuard(const LedLimits& limits)
    : limits_(limits), onSinceMs_(0), lastHostActivityAtMs_(0), ledOn_(false) {}

LedVerdict LedGuard::request(const bool on, const uint32_t nowMs) {
  LedVerdict verdict;
  verdict.accepted = true;
  verdict.on = on;
  verdict.changed = (on != ledOn_);

  // A command is itself proof the host is alive. Without this, a light switched
  // on after a long silence would inherit the stale activity stamp and be
  // stopped by the dead-man on the very next tick.
  lastHostActivityAtMs_ = nowMs;

  if (!verdict.changed) {
    // Re-asserting the state already held must not restart the on-duration
    // clock. The gateway re-sends on reconnect, and a light that has burned for
    // six hours has burned for six hours regardless of how often it was told so.
    return verdict;
  }

  if (on) {
    onSinceMs_ = nowMs;
  }
  ledOn_ = on;
  return verdict;
}

LedStopEvent LedGuard::tick(const uint32_t nowMs) {
  LedStopEvent event;
  event.stopped = false;
  event.cause = LedStop::kNone;
  event.onDurationMs = 0;

  // A dead-man guards a thing that is on. An unlit board may sit silent
  // indefinitely without that meaning anything is wrong.
  if (!ledOn_) {
    return event;
  }

  if (nowMs - lastHostActivityAtMs_ >= limits_.hostTimeoutMs) {
    return stop(LedStop::kWatchdog, nowMs);
  }
  return event;
}

void LedGuard::noteHostActivity(const uint32_t nowMs) {
  lastHostActivityAtMs_ = nowMs;
}

uint32_t LedGuard::onDurationMs(const uint32_t nowMs) const {
  if (!ledOn_) {
    return 0;
  }
  return nowMs - onSinceMs_;
}

LedStopEvent LedGuard::stop(const LedStop cause, const uint32_t nowMs) {
  LedStopEvent event;
  event.stopped = true;
  event.cause = cause;
  event.onDurationMs = nowMs - onSinceMs_;
  ledOn_ = false;
  return event;
}

}  // namespace tb
