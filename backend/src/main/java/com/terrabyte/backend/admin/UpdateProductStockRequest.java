package com.terrabyte.backend.admin;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record UpdateProductStockRequest(
        @NotNull @PositiveOrZero Integer stockQuantity) {
}
