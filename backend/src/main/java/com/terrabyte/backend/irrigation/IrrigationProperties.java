package com.terrabyte.backend.irrigation;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The safety envelope, in one place.
 *
 * <p>Defaults come from {@code docs/design/edge_ai_hardening.md} §개선 1. Two of
 * them are load-bearing and must not be relaxed for a demo: {@code doseMaxMl}
 * and {@code dailyBudgetMl} are what bound the worst case if every other
 * judgement in the system is wrong. {@code minInterval} may be shortened in a
 * demo profile, because a six-hour cooldown means nobody sees a second
 * irrigation.
 */
@ConfigurationProperties(prefix = "app.irrigation")
public record IrrigationProperties(
        Duration maxSampleAge,
        Duration minInterval,
        int dailyBudgetMl,
        int doseMinMl,
        int doseMaxMl,
        double defaultFlowMlPerS,
        Duration commandTtl,
        double implausibleJumpPct,
        Duration implausibleJumpWindow) {

    public IrrigationProperties {
        maxSampleAge = maxSampleAge == null ? Duration.ofMinutes(10) : maxSampleAge;
        minInterval = minInterval == null ? Duration.ofHours(6) : minInterval;
        dailyBudgetMl = dailyBudgetMl <= 0 ? 600 : dailyBudgetMl;
        doseMinMl = doseMinMl <= 0 ? 20 : doseMinMl;
        doseMaxMl = doseMaxMl <= 0 ? 200 : doseMaxMl;
        // A2 in the design doc: there is no flow meter, so volume is inferred
        // from pump runtime. Replace with a measured figure once one exists.
        defaultFlowMlPerS = defaultFlowMlPerS <= 0 ? 8.0 : defaultFlowMlPerS;
        commandTtl = commandTtl == null ? Duration.ofMinutes(2) : commandTtl;
        implausibleJumpPct = implausibleJumpPct <= 0 ? 30.0 : implausibleJumpPct;
        implausibleJumpWindow =
                implausibleJumpWindow == null ? Duration.ofSeconds(60) : implausibleJumpWindow;

        if (doseMinMl > doseMaxMl) {
            throw new IllegalArgumentException(
                    "app.irrigation.dose-min-ml must not exceed dose-max-ml");
        }
        if (doseMaxMl > dailyBudgetMl) {
            // Otherwise a single dose could exhaust or exceed the day's budget,
            // which makes the budget gate decorative.
            throw new IllegalArgumentException(
                    "app.irrigation.dose-max-ml must not exceed daily-budget-ml");
        }
    }

    /** How long the pump may run for a given volume, before the firmware interlock. */
    public int runtimeMsFor(int volumeMl) {
        return (int) Math.ceil(volumeMl / defaultFlowMlPerS * 1000.0);
    }

    /** The rolling window the daily budget is measured over. */
    public Duration budgetWindow() {
        return Duration.ofHours(24);
    }
}
