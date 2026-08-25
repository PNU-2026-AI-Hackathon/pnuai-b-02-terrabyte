package com.terrabyte.backend.irrigation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The manual-only grow-light switch. */
@RestController
@RequestMapping("/api/pots/{potId}/light")
public class LightController {

    private final LightService lightService;

    public LightController(LightService lightService) {
        this.lightService = lightService;
    }

    public record LightRequest(
            @NotNull(message = "조명 상태를 선택해 주세요.") Boolean on) {}

    @PostMapping
    public ResponseEntity<LightOutcome> switchLight(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long potId,
            @Valid @RequestBody LightRequest request) {
        LightOutcome outcome = lightService.requestManual(
                potId, Long.parseLong(jwt.getSubject()), request.on());
        return outcome.issued()
                ? ResponseEntity.status(HttpStatus.CREATED).body(outcome)
                : ResponseEntity.status(HttpStatus.CONFLICT).body(outcome);
    }
}
