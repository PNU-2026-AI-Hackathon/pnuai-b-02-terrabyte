package com.terrabyte.backend.measurement;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices/{deviceId}/measurements")
public class MeasurementController {

    private final MeasurementService measurementService;

    public MeasurementController(MeasurementService measurementService) {
        this.measurementService = measurementService;
    }

    @GetMapping("/latest")
    public LatestMeasurementsResponse latest(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long deviceId) {
        return measurementService.latest(Long.parseLong(jwt.getSubject()), deviceId);
    }

    @GetMapping
    public MeasurementSeriesResponse series(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long deviceId,
            @RequestParam String metric,
            @RequestParam(defaultValue = "24h") String range) {
        return measurementService.series(
                Long.parseLong(jwt.getSubject()),
                deviceId,
                metric,
                range);
    }
}
