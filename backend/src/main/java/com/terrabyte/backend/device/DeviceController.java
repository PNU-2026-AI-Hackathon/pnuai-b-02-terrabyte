package com.terrabyte.backend.device;

import jakarta.validation.Valid;
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

    public DeviceController(DeviceService deviceService) {
        this.deviceService = deviceService;
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
}
