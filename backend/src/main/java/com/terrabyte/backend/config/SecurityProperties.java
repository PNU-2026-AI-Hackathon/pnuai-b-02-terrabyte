package com.terrabyte.backend.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security")
public record SecurityProperties(Jwt jwt, Cors cors) {

    public record Jwt(String issuer, String secret, Duration accessTokenTtl) {
    }

    public record Cors(List<String> allowedOrigins) {
    }
}
