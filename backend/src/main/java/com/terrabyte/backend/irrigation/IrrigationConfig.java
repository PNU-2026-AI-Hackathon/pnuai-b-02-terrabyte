package com.terrabyte.backend.irrigation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the irrigation safety envelope and the command transport.
 *
 * <p>Matches how {@code MeasurementConfig} and {@code SecurityConfig} register
 * theirs. Worth its own class rather than annotations scattered on the Governor:
 * the values in {@link IrrigationProperties} are the safety limits, and one
 * obvious place where they enter the context makes them easier to audit.
 */
@Configuration
@EnableConfigurationProperties(IrrigationProperties.class)
public class IrrigationConfig {

    /**
     * Falls back to the logging dispatcher until a real downlink exists.
     *
     * <p>{@code @ConditionalOnMissingBean} belongs on a {@code @Bean} method,
     * not on a {@code @Component} — on a component it is evaluated during
     * scanning and simply never registers the bean, which is how this first
     * appeared: fifty-one context load failures and no dispatcher at all.
     */
    @Bean
    @ConditionalOnMissingBean(CommandDispatcher.class)
    public CommandDispatcher commandDispatcher() {
        return new LoggingCommandDispatcher();
    }
}
