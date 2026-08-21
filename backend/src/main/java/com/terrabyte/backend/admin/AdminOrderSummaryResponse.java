package com.terrabyte.backend.admin;

import java.time.Instant;

import com.terrabyte.backend.order.OrderStatus;
import com.terrabyte.backend.order.ShopOrder;

public record AdminOrderSummaryResponse(
        long id,
        String orderNumber,
        long userId,
        OrderStatus status,
        int totalQuantity,
        long totalPrice,
        String recipientName,
        Instant orderedAt,
        Instant updatedAt,
        Instant cancelledAt) {

    public static AdminOrderSummaryResponse from(ShopOrder order) {
        return new AdminOrderSummaryResponse(
                order.id(),
                order.orderNumber(),
                order.userId(),
                order.status(),
                order.totalQuantity(),
                order.totalPrice(),
                order.recipientName(),
                order.orderedAt(),
                order.updatedAt(),
                order.cancelledAt());
    }
}
