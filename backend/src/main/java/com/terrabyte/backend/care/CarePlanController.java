package com.terrabyte.backend.care;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pots")
public class CarePlanController {

    private final CarePlanService service;

    public CarePlanController(CarePlanService service) {
        this.service = service;
    }

    @GetMapping("/{potId}/care-plan")
    public CarePlanResponse generate(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long potId) {
        return service.generate(Long.parseLong(jwt.getSubject()), potId);
    }
}
