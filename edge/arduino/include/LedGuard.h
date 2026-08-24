#pragma once

#include <stdint.h>

// The grow-light latch and its dead-man, as pure logic with no <Arduino.h>
// dependency and no call to millis(). The caller passes the clock in, for the
// same reason ActuatorGuard does: a five-minute timeout and a 49.7-day counter
// rollover are not things a bench test reaches.
//
// This is a SEPARATE class from ActuatorGuard, and the reason is not tidiness.
// ActuatorGuard owns an eight-entry ring of command-id digests that is the last
// defence against a QoS-1 redelivery watering twice. Light commands are a latch
// - re-asserting "on" is a no-op - so they need no de-duplication at all, but
// they arrive far more often than doses do. Routing them through the same ring
// would evict pump ids after eight light transitions, and a redelivered pump
// command that should have been rejected as `duplicate` would run a second
// time. ActuatorGuard.cpp states the asymmetry plainly: a skipped irrigation is
// recoverable, a doubled one is not. The ring must never see a light id.
//
// Three things ActuatorGuard has and this deliberately does not:
//
//   - No G1 equivalent. A run ceiling exists because water accumulates in the
//     pot. Light does not accumulate; the daily integral does, and that is a
//     policy the gateway evaluates against the crop's DLI target.
//   - No G2 equivalent. A cooldown exists because the substrate needs time to
//     take up what it was given. A lamp has no analogue.
//   - No command-id ring, per the above.
//
// What remains is the dead-man, with a window two orders of magnitude longer
// than the pump's. G4 (boot safety) stays where it is: a property of statement
// order in setup(), which no class the caller must construct first can express.

namespace tb {

// Why the light turned off.
enum class LedStop : uint8_t {
  kNone,
  kCommanded,  // the host asked for off
  kWatchdog,   // the host went quiet
};

struct LedLimits {
  uint32_t hostTimeoutMs;
};

// The compiled-in TB_LED_HOST_TIMEOUT_MS. Tests use shorter limits for
// readability but also assert this, because the frozen contract is the default
// and not the override.
LedLimits configuredLedLimits();

struct LedVerdict {
  bool accepted;  // always true today; kept so a future gate can refuse
  bool on;        // the latch state after this command
  bool changed;   // false when the command re-asserted the state already held
};

struct LedStopEvent {
  bool stopped;  // true only on the tick that turns the light off
  LedStop cause;
  uint32_t onDurationMs;
};

class LedGuard {
 public:
  LedGuard();
  explicit LedGuard(const LedLimits& limits);

  // Set the latch. There is no id, no ring and no cooldown: setting "on" twice
  // is the same world as setting it once, so there is nothing to de-duplicate.
  // A commanded off is reported through the return value rather than through
  // tick(), mirroring how the pump path acks an accept separately from a run
  // ending.
  LedVerdict request(bool on, uint32_t nowMs);

  // Call as often as possible. Returns a stop event exactly once per lit
  // period, and only when the dead-man fired - a commanded off is not a stop
  // event, because the host already knows about it.
  LedStopEvent tick(uint32_t nowMs);

  // Any inbound byte from the host refreshes the window. Bytes are the
  // evidence, not their meaning, exactly as in ActuatorGuard.
  void noteHostActivity(uint32_t nowMs);

  bool ledOn() const { return ledOn_; }

  // How long the light has been on, or 0 when it is off.
  uint32_t onDurationMs(uint32_t nowMs) const;

  const LedLimits& limits() const { return limits_; }

 private:
  LedStopEvent stop(LedStop cause, uint32_t nowMs);

  LedLimits limits_;
  uint32_t onSinceMs_;
  uint32_t lastHostActivityAtMs_;
  bool ledOn_;
};

}  // namespace tb
