package com.terrabyte.backend.admin;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.admin")
public record AdminProperties(String apiKey) {

    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
