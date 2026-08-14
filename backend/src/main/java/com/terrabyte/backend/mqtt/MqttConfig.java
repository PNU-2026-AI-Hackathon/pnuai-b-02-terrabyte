package com.terrabyte.backend.mqtt;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires the Paho client used for the MQTT operational transport.
 *
 * <p>Everything here is gated on {@code app.mqtt.enabled} so that the test
 * suite and a plain local {@code bootRun} — neither of which has a broker —
 * keep booting exactly as before this transport was added.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(MqttProperties.class)
@ConditionalOnProperty(prefix = "app.mqtt", name = "enabled", havingValue = "true")
public class MqttConfig {

    /**
     * The backend never publishes, so it has no outbound state to persist and
     * {@link MemoryPersistence} is enough on the client side. Durability lives
     * on the broker instead: see {@code cleanSession} below.
     */
    @Bean
    public MqttClient mqttClient(MqttProperties properties) throws MqttException {
        MqttClient client =
                new MqttClient(properties.url(), properties.clientId(), new MemoryPersistence());
        // Acknowledge a message only once it has actually been ingested, rather
        // than the moment it is handed to the callback. Without this the broker
        // considers delivery complete as soon as Paho receives the message, so
        // a sample that fails to reach InfluxDB is gone: the gateway's outbox
        // already dropped it when the *broker* acked the publish, and the
        // backend never gets it again.
        client.setManualAcks(true);
        return client;
    }

    @Bean
    public MqttConnectOptions mqttConnectOptions(MqttProperties properties) {
        MqttConnectOptions options = new MqttConnectOptions();
        options.setServerURIs(new String[] {properties.url()});
        options.setUserName(properties.username());
        options.setPassword(properties.password().toCharArray());
        // A persistent session (cleanSession=false) with a stable client id is
        // what makes the broker queue QoS 1 uplinks while the backend is
        // restarting or down. With a clean session the broker discards them and
        // the samples are lost, because the gateway's outbox entry was already
        // released by the broker's PUBACK long before the backend saw it.
        options.setCleanSession(properties.cleanSession());
        options.setConnectionTimeout((int) properties.connectionTimeout().toSeconds());
        options.setKeepAliveInterval((int) properties.keepAlive().toSeconds());
        // Paho reconnects the transport automatically, but it does not restore
        // subscriptions when cleanSession is true — the subscriber re-subscribes
        // itself from the connectComplete callback to cover that gap.
        options.setAutomaticReconnect(true);
        return options;
    }
}
