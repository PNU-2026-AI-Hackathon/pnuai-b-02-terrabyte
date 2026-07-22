package com.terrabyte.backend.score;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices/{deviceId}/score")
public class EnvironmentScoreController {

    private final EnvironmentScoreService service;

    public EnvironmentScoreController(EnvironmentScoreService service) {
        this.service = service;
    }

    @GetMapping
    public EnvironmentScoreResponse latest(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long deviceId) {
        return service.latest(Long.parseLong(jwt.getSubject()), deviceId);
    }
}
