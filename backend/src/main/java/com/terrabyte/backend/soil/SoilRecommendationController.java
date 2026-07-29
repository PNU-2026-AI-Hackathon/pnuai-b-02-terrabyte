package com.terrabyte.backend.soil;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices/{deviceId}/soil-recommendation")
public class SoilRecommendationController {

    private final SoilRecommendationService service;

    public SoilRecommendationController(SoilRecommendationService service) {
        this.service = service;
    }

    @GetMapping
    public SoilRecommendationResponse latest(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long deviceId) {
        return service.latest(Long.parseLong(jwt.getSubject()), deviceId);
    }
}
