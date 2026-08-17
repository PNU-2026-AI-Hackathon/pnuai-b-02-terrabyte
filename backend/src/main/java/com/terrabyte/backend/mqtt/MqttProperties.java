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
        boolean cleanSession,
        Duration publishTimeout) {

    public MqttProperties {
        topicPrefix = topicPrefix == null || topicPrefix.isBlank() ? "tb/v2" : topicPrefix;
        connectionTimeout = connectionTimeout == null ? Duration.ofSeconds(10) : connectionTimeout;
        keepAlive = keepAlive == null ? Duration.ofSeconds(30) : keepAlive;
        // How long a downlink publish may wait for the broker's acknowledgement.
        // Bounded because that wait happens on the thread serving a user's tap,
        // and Paho's own default is to wait indefinitely. Well under the two
        // minute command TTL, so a publish that needs longer than this has
        // already lost its usefulness.
        publishTimeout = publishTimeout == null ? Duration.ofSeconds(5) : publishTimeout;
    }

    /** Wildcard subscription across every gateway's uplink of one kind. */
    public String uplinkFilter(String suffix) {
        return "%s/+/up/%s".formatted(topicPrefix, suffix);
    }

    /**
     * The downlink topic for one named gateway. Never wildcarded: a command has
     * exactly one recipient.
     *
     * <p>The gateway id is rejected rather than escaped when it contains a topic
     * separator or a subscription wildcard. That is not defensive tidiness — a
     * {@code hardware_id} of {@code +} would turn one pump command into a
     * command every gateway matches, and {@code #} the same. The id reaches here
     * from a database column, so it is not attacker-controlled today, but the
     * cost of being wrong is watering every pot on the estate.
     */
    public String downlinkTopic(String gatewayId, String suffix) {
        if (gatewayId == null || gatewayId.isBlank()) {
            throw new IllegalArgumentException("gateway id must not be blank");
        }
        if (gatewayId.indexOf('/') >= 0
                || gatewayId.indexOf('+') >= 0
                || gatewayId.indexOf('#') >= 0) {
            throw new IllegalArgumentException(
                    "gateway id must not contain a topic separator or wildcard: " + gatewayId);
        }
        return "%s/%s/dn/%s".formatted(topicPrefix, gatewayId, suffix);
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
