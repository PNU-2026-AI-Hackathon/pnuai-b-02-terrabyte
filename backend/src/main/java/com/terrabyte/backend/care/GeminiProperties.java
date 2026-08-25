package com.terrabyte.backend.care;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai.gemini")
public record GeminiProperties(
        boolean enabled,
        String apiKey,
        String model,
        String baseUrl,
        Duration cacheTtl) {

    public boolean configured() {
        return enabled
                && apiKey != null && !apiKey.isBlank()
                && model != null && !model.isBlank()
                && baseUrl != null && !baseUrl.isBlank();
    }
}
