package com.terrabyte.backend.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.payment.toss")
public record TossPaymentProperties(
        boolean enabled,
        String baseUrl,
        String clientKey,
        String secretKey,
        String successUrl,
        String failUrl) {

    public boolean configured() {
        return enabled
                && clientKey != null && !clientKey.isBlank()
                && secretKey != null && !secretKey.isBlank();
    }
}
