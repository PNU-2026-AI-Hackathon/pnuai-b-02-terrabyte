package com.terrabyte.backend.admin;

import com.terrabyte.backend.order.OrderStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateAdminOrderStatusRequest(
        @NotNull OrderStatus status) {
}
