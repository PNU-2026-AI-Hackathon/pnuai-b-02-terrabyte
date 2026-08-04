package com.terrabyte.backend.space;

import java.util.List;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/spaces")
public class CultivationSpaceController {

    private final CultivationSpaceRepository spaceRepository;

    public CultivationSpaceController(CultivationSpaceRepository spaceRepository) {
        this.spaceRepository = spaceRepository;
    }

    @GetMapping
    public List<CultivationSpaceResponse> findAll(@AuthenticationPrincipal Jwt jwt) {
        return spaceRepository.findAllByUserId(Long.parseLong(jwt.getSubject())).stream()
                .map(CultivationSpaceResponse::from)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CultivationSpaceResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateSpaceRequest request) {
        CultivationSpace space = spaceRepository.save(
                Long.parseLong(jwt.getSubject()),
                request.name().trim(),
                request.spaceType().trim(),
                request.areaSquareMeters());
        return CultivationSpaceResponse.from(space);
    }
}
