package com.terrabyte.backend.irrigation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on Spring's scheduler, for the expiry sweep and nothing else yet.
 *
 * <p>Deliberately its own class with its own switch, because
 * {@code @EnableScheduling} is not a local change: it installs a bean
 * post-processor that activates every {@code @Scheduled} method in the context,
 * and it is the first such annotation in this repository. A background thread
 * mutating {@code device_command} on a timer is exactly the sort of thing that
 * makes an integration test suite intermittently red — one that inserts a
 * deliberately overdue command and asserts on its state now has a competitor.
 *
 * <p>So the test profile switches this off (see {@code application-test.yml}) and
 * {@link ExpiredCommandSweeper#sweepOnce()} is called directly instead, which
 * tests the sweep's logic without racing it. Production keeps it on by default:
 * the sweep is what stops a lost acknowledgement from holding a pot's in-flight
 * gate open forever, so silence would be the worse failure.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
        prefix = "app.irrigation.sweep",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class IrrigationSchedulingConfig {
}
