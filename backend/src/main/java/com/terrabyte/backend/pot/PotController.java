package com.terrabyte.backend.pot;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pots")
public class PotController {

    private final PotService potService;

    public PotController(PotService potService) {
        this.potService = potService;
    }

    @GetMapping
    public List<PotResponse> findAll(@AuthenticationPrincipal Jwt jwt) {
        return potService.findAll(Long.parseLong(jwt.getSubject()));
    }

    @GetMapping("/{potId}")
    public PotResponse findOne(@AuthenticationPrincipal Jwt jwt, @PathVariable long potId) {
        return potService.findOne(Long.parseLong(jwt.getSubject()), potId);
    }
}
