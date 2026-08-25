package com.terrabyte.backend.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * The single switch for background timers in this application.
 *
 * <p>Its own class with its own property because {@code @EnableScheduling} is not
 * a local change: it installs a bean post-processor that activates
 * <em>every</em> {@code @Scheduled} method in the context. That makes it a
 * process-wide capability, not a feature flag, and tying it to any one feature's
 * switch produces a surprise the first time a second feature needs a timer —
 * turning the second one on would silently revive the first.
 *
 * <p>Two tasks depend on it today: the expiry sweep, which stops a lost
 * acknowledgement from holding a pot's in-flight gate open forever, and the
 * backend liveness heartbeat, which is how a gateway tells a dead application
 * from a live broker. Both stay on by default in production, because for both of
 * them silence is the worse failure.
 *
 * <p>The test profile switches this off (see {@code application-test.yml}) and
 * calls {@code sweepOnce()} and {@code publishOnce()} directly instead. A
 * background thread mutating {@code device_command} on a timer is exactly the
 * sort of thing that makes an integration suite intermittently red: a test that
 * inserts a deliberately overdue command and asserts on its state now has a
 * competitor.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
        prefix = "app.scheduling",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class SchedulingConfig {
}
