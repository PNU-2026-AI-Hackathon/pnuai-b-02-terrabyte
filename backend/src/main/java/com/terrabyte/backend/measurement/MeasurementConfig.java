package com.terrabyte.backend.measurement;

import java.time.Clock;

import com.influxdb.client.InfluxDBClient;
import com.influxdb.client.InfluxDBClientFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(InfluxProperties.class)
public class MeasurementConfig {

    @Bean
    public Clock measurementClock() {
        return Clock.systemUTC();
    }

    @Bean(destroyMethod = "close")
    public InfluxDBClient influxDBClient(InfluxProperties properties) {
        return InfluxDBClientFactory.create(
                properties.url(),
                properties.token().toCharArray(),
                properties.org(),
                properties.bucket());
    }
}
