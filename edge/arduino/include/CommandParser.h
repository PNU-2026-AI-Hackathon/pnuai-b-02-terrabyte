#pragma once

#include <stddef.h>
#include <stdint.h>

// kCommandIdCapacity lives with the guard, which owns the id lifecycle.
#include "ActuatorGuard.h"

// Parser for the inbound half of the serial link.
//
// The link now carries two message families with *different envelope keys*, and
// they are not symmetric:
//
//   inbound   {"t":"cmd","id":"01J8F3","act":"pump","ms":18000,"ml":120}
//   inbound   {"t":"cmd","id":"led-00000012","act":"led","on":1}
//   inbound   {"t":"ka"}
//   outbound  {"message_type":"telemetry", ...}
//   outbound  {"t":"ack","id":"01J8F3","ph":"accepted"}
//
// The short keys are not a style choice: the ATmega328P has 2KB of SRAM, and a
// general-purpose JSON parser plus a document buffer does not fit next to the
// sensor libraries. So this is a key scanner, not a JSON parser. It reads the
// handful of keys the contract defines and ignores everything else, including
// any `message_type` envelope that is echoed back at it.
//
// Like ActuatorGuard, this has no <Arduino.h> dependency so that [env:native]
// can test it: a parser that mistakes a keep-alive for a command, or truncates
// an id, would turn into a mis-dosed plant rather than a failed assertion.

namespace tb {

enum class InboundKind : uint8_t {
  kIgnored,          // not addressed to the command path at all
  kKeepAlive,        // {"t":"ka"} - the 1s dead-man tick
  kPumpCommand,      // complete and executable
  kLedCommand,       // grow-light latch, complete and executable
  kUnusableCommand,  // t=="cmd" but not executable; `id` may still be readable
};

struct InboundMessage {
  InboundKind kind;
  char id[kCommandIdCapacity];
  uint32_t runtimeMs;  // `ms`, the authoritative run duration
  uint16_t volumeMl;   // `ml`, carried for reporting only; see the .cpp
  bool ledOn;          // `on`, meaningful only when kind == kLedCommand
};

// `line` must be a NUL-terminated single line with no trailing newline.
InboundMessage parseInboundLine(const char* line);

}  // namespace tb
