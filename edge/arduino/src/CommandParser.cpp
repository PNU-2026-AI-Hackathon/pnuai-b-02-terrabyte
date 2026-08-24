#include "../include/CommandParser.h"

#include <ctype.h>
#include <string.h>

namespace tb {
namespace {

// Envelope and actuator names in the contract are short words; anything longer
// is not a name this firmware knows.
constexpr size_t kShortTokenCapacity = 12;

// Locates the value that follows `quotedKey`. The key is matched *with* its
// quotes, which is what keeps a short key from matching inside a longer one:
// searching for "\"t\"" does not hit "message_type" or "act".
const char* findValue(const char* line, const char* quotedKey) {
  const char* found = strstr(line, quotedKey);
  if (found == nullptr) {
    return nullptr;
  }
  const char* cursor = found + strlen(quotedKey);
  while (isspace(static_cast<unsigned char>(*cursor))) {
    ++cursor;
  }
  if (*cursor != ':') {
    return nullptr;
  }
  ++cursor;
  while (isspace(static_cast<unsigned char>(*cursor))) {
    ++cursor;
  }
  return cursor;
}

// Reads a non-empty quoted string. Backslash escapes are deliberately not
// supported: every string the contract defines is alphanumeric, and an escape
// would end the value early, which fails towards "unusable command" rather than
// towards a wrong command.
bool readQuotedText(const char* cursor, char* out, const size_t capacity) {
  out[0] = '\0';
  if (cursor == nullptr || *cursor != '"') {
    return false;
  }
  ++cursor;

  size_t length = 0;
  while (*cursor != '"' && *cursor != '\0') {
    // Refused, not truncated. A truncated id would collide with a different
    // command in the de-duplication ring and address its ack to the wrong one.
    if (length + 1 >= capacity) {
      out[0] = '\0';
      return false;
    }
    out[length++] = *cursor++;
  }

  if (*cursor != '"' || length == 0) {
    out[0] = '\0';
    return false;
  }
  out[length] = '\0';
  return true;
}

// Reads an unsigned decimal, saturating at `ceiling` instead of wrapping. A
// wrapped duration could turn a huge request into a small one, and the whole
// point of G1 is that an implausible request is still bounded, not reinterpreted.
bool readUnsigned(const char* cursor, uint32_t* value, const uint32_t ceiling) {
  *value = 0;
  if (cursor == nullptr || !isdigit(static_cast<unsigned char>(*cursor))) {
    return false;
  }

  uint32_t accumulated = 0;
  while (isdigit(static_cast<unsigned char>(*cursor))) {
    const uint32_t digit = static_cast<uint32_t>(*cursor - '0');
    if (accumulated > ((ceiling - digit) / 10U)) {
      accumulated = ceiling;
      break;
    }
    accumulated = (accumulated * 10U) + digit;
    ++cursor;
  }

  *value = accumulated;
  return true;
}

}  // namespace

InboundMessage parseInboundLine(const char* line) {
  InboundMessage message;
  message.kind = InboundKind::kIgnored;
  message.id[0] = '\0';
  message.runtimeMs = 0;
  message.volumeMl = 0;
  message.ledOn = false;

  if (line == nullptr) {
    return message;
  }

  char envelope[kShortTokenCapacity];
  if (!readQuotedText(findValue(line, "\"t\""), envelope, sizeof(envelope))) {
    return message;
  }
  if (strcmp(envelope, "ka") == 0) {
    message.kind = InboundKind::kKeepAlive;
    return message;
  }
  if (strcmp(envelope, "cmd") != 0) {
    return message;
  }

  // From here on the line is addressed to the command path, so every exit is a
  // rejection rather than silence. The id is read first and kept even when the
  // rest fails, because an ack without an id cannot be correlated upstream.
  message.kind = InboundKind::kUnusableCommand;
  readQuotedText(findValue(line, "\"id\""), message.id, kCommandIdCapacity);

  char actuator[kShortTokenCapacity];
  if (!readQuotedText(findValue(line, "\"act\""), actuator, sizeof(actuator))) {
    return message;
  }
  if (strcmp(actuator, "led") == 0) {
    // The light is a latch, so `on:0` is a perfectly good command - it is the
    // one that turns the lamp OFF. The pump path below treats a zero as
    // unusable, and copying that rule here is exactly how a light gets left on
    // after the host asked for darkness. Presence is what matters, not truth.
    uint32_t on = 0;
    if (!readUnsigned(findValue(line, "\"on\""), &on, 0xFFFFFFFFUL)) {
      return message;
    }
    // readUnsigned saturates at its ceiling, so the ceiling is left wide and
    // the range is checked here instead. Reading with a ceiling of 1 would turn
    // `on:7` into a confident 1, and guessing what an undefined value meant is
    // the other way a lamp gets left on.
    if (on > 1) {
      return message;
    }
    if (message.id[0] == '\0') {
      return message;
    }
    message.ledOn = (on == 1);
    message.kind = InboundKind::kLedCommand;
    return message;
  }

  if (strcmp(actuator, "pump") != 0) {
    return message;
  }

  uint32_t runtimeMs = 0;
  if (!readUnsigned(findValue(line, "\"ms\""), &runtimeMs, 0xFFFFFFFFUL)) {
    return message;
  }
  if (runtimeMs == 0) {
    return message;
  }

  // `ml` is optional and never drives the pump. Without a flow meter the board
  // cannot measure volume, so the run is timed by `ms` and `ml` travels only so
  // the ack and telemetry can report what the server intended.
  uint32_t volumeMl = 0;
  readUnsigned(findValue(line, "\"ml\""), &volumeMl, 0xFFFFUL);

  if (message.id[0] == '\0') {
    return message;
  }

  message.runtimeMs = runtimeMs;
  message.volumeMl = static_cast<uint16_t>(volumeMl);
  message.kind = InboundKind::kPumpCommand;
  return message;
}

}  // namespace tb
