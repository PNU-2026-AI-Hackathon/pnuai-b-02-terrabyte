package com.terrabyte.backend.crop;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api")
public class CropController {

    private final CropService cropService;

    public CropController(CropService cropService) {
        this.cropService = cropService;
    }

    @GetMapping("/crops")
    public List<CropResponse> findAll(
            @RequestParam(required = false) @Size(max = 50) String q) {
        return cropService.findAll(q);
    }

    @PatchMapping("/devices/{deviceId}/crop")
    @Deprecated
    public CropSelectionResponse select(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long deviceId,
            @Valid @RequestBody CropSelectionRequest request) {
        return cropService.selectForDevice(Long.parseLong(jwt.getSubject()), deviceId, request);
    }

    @PatchMapping("/pots/{potId}/crop")
    public CropSelectionResponse selectPot(@AuthenticationPrincipal Jwt jwt, @PathVariable long potId,
            @Valid @RequestBody CropSelectionRequest request) {
        return cropService.select(Long.parseLong(jwt.getSubject()), potId, request);
    }
}
