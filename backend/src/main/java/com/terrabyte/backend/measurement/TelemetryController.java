package com.terrabyte.backend.measurement;

import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Debug and fallback ingest path for telemetry v2.
 *
 * <p>MQTT is the operational transport; this endpoint exists so the whole
 * pipeline can be exercised with one curl. It shares the envelope and the
 * service with the subscriber, so testing here tests the real path.
 *
 * <p>Disabled unless {@code app.telemetry.http-ingest.enabled} is true. It has
 * no gateway authentication of its own — over MQTT the broker ACL proves which
 * gateway is publishing, and there is no equivalent here, so anyone who can
 * reach it can claim to be any gateway. That is acceptable on a developer
 * machine and not in production.
 */
@RestController
@RequestMapping("/api/telemetry")
@ConditionalOnProperty(
        prefix = "app.telemetry.http-ingest",
        name = "enabled",
        havingValue = "true")
public class TelemetryController {

    private final MeasurementService measurementService;

    public TelemetryController(MeasurementService measurementService) {
        this.measurementService = measurementService;
    }

    @PostMapping
    public ResponseEntity<TelemetryAcceptedResponse> ingest(
            @Valid @RequestBody TelemetryEnvelope envelope) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(measurementService.ingest(envelope.gatewayId(), envelope));
    }
}
