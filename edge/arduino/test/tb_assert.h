#pragma once

#include <stdio.h>

// Minimal assertion helpers shared by every suite under test/.
//
// platformio.ini's [env:native] selects `test_framework = custom`, so a suite is
// a plain C++ program. That choice is deliberate: it keeps the interlock tests
// runnable with a bare host compiler on a machine that has no PlatformIO
// installation, and PlatformIO runs the very same binary when it is available.
//
// Checks are counted rather than aborting on the first failure. One run should
// report every broken interlock, not just the first one.

namespace tbtest {

inline int& checks() {
  static int value = 0;
  return value;
}

inline int& failures() {
  static int value = 0;
  return value;
}

inline void record(const bool passed, const char* expression, const char* file,
                   const int line) {
  ++checks();
  if (passed) {
    return;
  }
  ++failures();
  printf("FAIL %s:%d  %s\n", file, line, expression);
}

inline void recordEqual(const unsigned long actual, const unsigned long expected,
                        const char* expression, const char* file,
                        const int line) {
  ++checks();
  if (actual == expected) {
    return;
  }
  ++failures();
  printf("FAIL %s:%d  %s -> %lu, expected %lu\n", file, line, expression, actual,
         expected);
}

inline void recordEqualText(const char* actual, const char* expected,
                            const char* expression, const char* file,
                            const int line) {
  ++checks();
  const char* left = actual == nullptr ? "" : actual;
  const char* right = expected == nullptr ? "" : expected;
  size_t index = 0;
  while (left[index] == right[index] && left[index] != '\0') {
    ++index;
  }
  if (left[index] == right[index]) {
    return;
  }
  ++failures();
  printf("FAIL %s:%d  %s -> \"%s\", expected \"%s\"\n", file, line, expression,
         left, right);
}

inline int summary(const char* suite) {
  printf("%s: %d checks, %d failures\n", suite, checks(), failures());
  return failures() == 0 ? 0 : 1;
}

}  // namespace tbtest

#define TB_CHECK(condition) \
  tbtest::record((condition), #condition, __FILE__, __LINE__)

#define TB_CHECK_EQ(actual, expected)                                        \
  tbtest::recordEqual(static_cast<unsigned long>(actual),                    \
                      static_cast<unsigned long>(expected), #actual, __FILE__, \
                      __LINE__)

#define TB_CHECK_TEXT(actual, expected) \
  tbtest::recordEqualText((actual), (expected), #actual, __FILE__, __LINE__)
