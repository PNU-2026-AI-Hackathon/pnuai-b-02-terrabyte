package com.terrabyte.backend.measurement;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.influx")
public record InfluxProperties(
        String url,
        String token,
        String org,
        String bucket,
        String deviceKey) {
}
