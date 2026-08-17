#pragma once

#include <stddef.h>
#include <stdint.h>

// Hard interlocks G1-G3 plus command-id de-duplication, as pure logic with no
// <Arduino.h> dependency and no call to millis(). The caller passes the clock
// in. Two reasons, in order of importance:
//
//   1. Safety code that cannot be unit tested cannot be trusted. There is no
//      pump circuit yet, and even once there is one, a 10-minute cooldown and a
//      49.7-day counter rollover are not things a bench test reaches.
//   2. platformio.ini's build_src_filter makes main.cpp and dataset_logger.cpp
//      mutually exclusive, so [env:native] has to compile this translation unit
//      on its own.
//
// Two things deliberately live elsewhere:
//   - G4 (boot safety) is a property of statement order in setup() and cannot be
//     expressed by a class that setup() has to construct first.
//   - TTL. The board has no RTC, so it never compares wall clocks. It only ever
//     handles the relative `ms` in a command; expiry is the Orange Pi's job.
//
// Nothing here writes a pin. The guard decides, main.cpp actuates. That split is
// what makes the decisions testable, and it means the guard is also the single
// owner of "is the pump running" - callers must not track that separately.

namespace tb {

// A full Crockford base32 ULID is 26 characters. The Orange Pi may also send a
// shortened id as in the design doc example ("01J8F3"); both must fit.
constexpr size_t kCommandIdCapacity = 27;

// De-duplication depth. At the real irrigation cadence (hours apart) eight
// entries are ample; a burst deeper than that forgets the oldest id, which is
// the documented and accepted limit of this defence.
constexpr uint8_t kCommandIdRingSize = 8;

// Why a rejection happened. These are firmware-local diagnostic tokens, not
// state-machine inputs: the same word means different things at different
// layers (the server's `cooldown` is a pre-publish denial, this one is a
// post-publish firmware refusal), so upstream keys state off the ack phase and
// keeps the reason as free text.
enum class RejectReason : uint8_t {
  kNone,
  kBadRequest,  // unusable command: no id, or a zero-length run
  kDuplicate,   // this id already ran and is still in the ring
  kBusy,        // a run is already in progress
  kCooldown,    // G2
};

// Why a run ended.
enum class StopCause : uint8_t {
  kNone,
  kVolumeReached,  // ran the whole requested duration
  kMaxRuntime,     // G1 clamped the duration and the clamp is what expired
  kWatchdog,       // G3
};

struct GuardLimits {
  uint32_t absMaxRuntimeMs;  // G1
  uint32_t minIntervalMs;    // G2
  uint32_t hostTimeoutMs;    // G3
};

// The compiled-in TB_* values. Tests use shorter limits for readability but also
// assert these, because the frozen contract is the default and not the override.
GuardLimits configuredGuardLimits();

struct PumpVerdict {
  bool accepted;
  RejectReason reason;  // meaningful only when !accepted
  uint32_t grantedMs;   // the duration actually granted, after the G1 clamp
  bool clampedByAbsMax;
};

struct PumpStop {
  bool stopped;  // true only on the tick that ends a run
  StopCause cause;
  uint32_t runtimeMs;
};

class ActuatorGuard {
 public:
  ActuatorGuard();
  explicit ActuatorGuard(const GuardLimits& limits);

  // Evaluates every gate and, when it accepts, starts the run. There is no
  // separate start() on purpose: a caller that could start a run without asking
  // would be a way around the interlocks.
  PumpVerdict requestPump(const char* commandId, uint32_t requestedMs,
                          uint32_t nowMs);

  // Call as often as possible while a run is in progress. Returns a stop event
  // exactly once per run.
  PumpStop tick(uint32_t nowMs);

  // Any inbound byte from the host, command or dead-man tick alike, refreshes
  // the G3 window. Bytes are the evidence, not their meaning: a host that is
  // still talking is still alive even if the line turns out to be garbage.
  void noteHostActivity(uint32_t nowMs);

  bool pumpRunning() const { return pumpRunning_; }

  // Time until a fresh command could pass G2, which is what the server actually
  // needs to know. This is a countdown, not the configured interval: it reads
  // minIntervalMs only in the instant a run stops and falls to zero from there.
  // While a run is in progress it includes the remaining runtime, because the
  // cooldown has not started counting yet.
  uint32_t pumpLockoutRemainingMs(uint32_t nowMs) const;

  // The id of the run in progress, or the last one; "" before the first accept.
  const char* activeCommandId() const { return activeCommandId_; }

  uint32_t grantedRuntimeMs() const { return grantedMs_; }
  const GuardLimits& limits() const { return limits_; }

 private:
  bool isDuplicate(uint32_t digest) const;
  void remember(uint32_t digest);
  PumpStop stopPump(StopCause cause, uint32_t nowMs, uint32_t runtimeMs);

  GuardLimits limits_;

  // Only 32-bit digests are retained. Eight full ids would cost 216 of the
  // ATmega328P's 2048 SRAM bytes, and a digest collision can only fail in one
  // direction: a spurious `duplicate` rejection, which leaves the pump off. A
  // skipped irrigation is recoverable; a doubled one is not.
  uint32_t idRing_[kCommandIdRingSize];
  uint8_t idRingCount_;
  uint8_t idRingNext_;

  char activeCommandId_[kCommandIdCapacity];
  uint32_t runStartedAtMs_;
  uint32_t grantedMs_;
  uint32_t lastHostActivityAtMs_;
  uint32_t lastStopAtMs_;
  bool pumpRunning_;
  bool clampedByAbsMax_;

  // Distinguishes "no run has ever stopped" from "a run stopped at millis()==0".
  // Without it, a board that boots and is commanded immediately would compare
  // against a stop that never happened.
  bool hasStopped_;
};

// Exposed for tests only: FNV-1a over the id text.
uint32_t commandIdDigest(const char* commandId);

}  // namespace tb
