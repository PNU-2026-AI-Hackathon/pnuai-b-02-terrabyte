package com.terrabyte.backend.mqtt;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Broker connection settings.
 *
 * <p>{@code topicPrefix} is versioned ({@code tb/v2}) so a future contract can
 * run alongside this one rather than replacing it in place.
 */
@ConfigurationProperties(prefix = "app.mqtt")
public record MqttProperties(
        boolean enabled,
        String url,
        String clientId,
        String username,
        String password,
        String topicPrefix,
        Duration connectionTimeout,
        Duration keepAlive,
        boolean cleanSession) {

    public MqttProperties {
        topicPrefix = topicPrefix == null || topicPrefix.isBlank() ? "tb/v2" : topicPrefix;
        connectionTimeout = connectionTimeout == null ? Duration.ofSeconds(10) : connectionTimeout;
        keepAlive = keepAlive == null ? Duration.ofSeconds(30) : keepAlive;
    }

    /** Wildcard subscription across every gateway's uplink of one kind. */
    public String uplinkFilter(String suffix) {
        return "%s/+/up/%s".formatted(topicPrefix, suffix);
    }

    /**
     * Extract the gateway id from {@code tb/v2/{gatewayId}/up/...}.
     *
     * <p>This is the authenticated identity: the broker ACL only lets a gateway
     * publish beneath its own id, so the topic cannot name someone else.
     */
    public String gatewayIdFromTopic(String topic) {
        String[] segments = topic.split("/");
        int prefixSegments = topicPrefix.split("/").length;
        if (segments.length <= prefixSegments) {
            throw new IllegalArgumentException("topic has no gateway segment: " + topic);
        }
        String gatewayId = segments[prefixSegments];
        if (gatewayId.isBlank()) {
            throw new IllegalArgumentException("topic has a blank gateway segment: " + topic);
        }
        return gatewayId;
    }
}
