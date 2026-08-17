package com.terrabyte.backend.mqtt;

import org.eclipse.paho.client.mqttv3.MqttMessage;

/**
 * Handles one kind of gateway uplink.
 *
 * <p>This exists because {@code MqttClient.setCallback} accepts exactly one
 * callback. Before this split, the single callback class owned both the
 * subscription list and the {@code messageArrived} branch, so adding a third
 * uplink meant editing the class that already owned the other two. Now
 * {@link MqttUplinkRouter} owns the transport and each handler owns its own
 * subscription, declared by {@link #topicSuffix()}.
 *
 * <p>Handlers deliberately know nothing about topics beyond that suffix. The
 * router parses the topic, and in particular it is the router that extracts the
 * gateway id — the one piece of authenticated identity in this whole path,
 * because the broker ACL restricts a gateway to publishing beneath its own id.
 * Keeping that parse in one place is what stops a second handler from inventing
 * a slightly different, slightly weaker version of it.
 */
public interface MqttUplinkHandler {

    /**
     * The last segment of {@code tb/v2/{gatewayId}/up/{suffix}} this handler
     * claims. One handler per suffix; the router subscribes on its behalf.
     */
    String topicSuffix();

    /**
     * @param gatewayId parsed from the topic by the router, never null or blank
     * @return true when the message is finished with and may be acknowledged.
     *         False leaves it unacknowledged so the broker redelivers it, which
     *         is the right answer only for a failure that a retry could fix.
     */
    boolean handle(String gatewayId, MqttMessage message);
}
