package com.terrabyte.backend.space;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateSpaceRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(max = 50) String spaceType,
        @NotNull @DecimalMin("0.01") @Digits(integer = 8, fraction = 2)
        BigDecimal areaSquareMeters,
        LightSource lightSource) {
}
