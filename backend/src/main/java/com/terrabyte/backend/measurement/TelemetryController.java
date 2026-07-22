package com.terrabyte.backend.measurement;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/telemetry")
public class TelemetryController {

    private final MeasurementService measurementService;

    public TelemetryController(MeasurementService measurementService) {
        this.measurementService = measurementService;
    }

    @PostMapping
    public ResponseEntity<TelemetryAcceptedResponse> ingest(
            @RequestHeader(value = "X-Device-Key", required = false) String deviceKey,
            @Valid @RequestBody TelemetrySampleRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(measurementService.ingest(deviceKey, request));
    }
}
