package com.terrabyte.backend.ai;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the AI server settings.
 *
 * <p>Separate from {@link IrrigationAiClient} to match the house pattern
 * ({@code MeasurementConfig}, {@code SecurityConfig}) — the client should be a
 * plain collaborator, not also the thing that wires the context.
 */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiConfig {
}
