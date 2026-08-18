package com.terrabyte.backend.device;

import jakarta.validation.Valid;
import com.terrabyte.backend.pot.CreatePotRequest;
import com.terrabyte.backend.pot.PotResponse;
import com.terrabyte.backend.pot.PotService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private final DeviceService deviceService;
    private final PotService potService;

    public DeviceController(DeviceService deviceService, PotService potService) {
        this.deviceService = deviceService;
        this.potService = potService;
    }

    @PostMapping
    public ResponseEntity<DeviceResponse> register(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody RegisterDeviceRequest request) {
        DeviceResponse response = deviceService.register(
                Long.parseLong(jwt.getSubject()),
                request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public java.util.List<DeviceResponse> all(@AuthenticationPrincipal Jwt jwt) {
        return deviceService.findAll(Long.parseLong(jwt.getSubject()));
    }

    @GetMapping("/{deviceId}")
    public DeviceResponse one(@AuthenticationPrincipal Jwt jwt, @PathVariable long deviceId) {
        return deviceService.findOne(Long.parseLong(jwt.getSubject()), deviceId);
    }

    @PostMapping("/{deviceId}/pots")
    public ResponseEntity<PotResponse> createPot(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long deviceId,
            @Valid @RequestBody CreatePotRequest request) {
        PotResponse response = potService.create(
                Long.parseLong(jwt.getSubject()), deviceId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
