package com.terrabyte.backend.measurement;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class MeasurementController {

    private final MeasurementService measurementService;

    public MeasurementController(MeasurementService measurementService) {
        this.measurementService = measurementService;
    }

    @GetMapping("/pots/{potId}/measurements/latest")
    public LatestMeasurementsResponse latest(@AuthenticationPrincipal Jwt jwt, @PathVariable long potId) {
        return measurementService.latest(Long.parseLong(jwt.getSubject()), potId);
    }

    @GetMapping("/pots/{potId}/measurements")
    public MeasurementSeriesResponse series(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long potId,
            @RequestParam String metric,
            @RequestParam(defaultValue = "24h") String range) {
        return measurementService.series(Long.parseLong(jwt.getSubject()), potId, metric, range);
    }

    @Deprecated
    @GetMapping("/devices/{deviceId}/measurements/latest")
    public LatestMeasurementsResponse latestForDevice(
            @AuthenticationPrincipal Jwt jwt, @PathVariable long deviceId) {
        return measurementService.latestForDevice(Long.parseLong(jwt.getSubject()), deviceId);
    }

    @Deprecated
    @GetMapping("/devices/{deviceId}/measurements")
    public MeasurementSeriesResponse seriesForDevice(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long deviceId,
            @RequestParam String metric,
            @RequestParam(defaultValue = "24h") String range) {
        return measurementService.seriesForDevice(
                Long.parseLong(jwt.getSubject()), deviceId, metric, range);
    }
}
