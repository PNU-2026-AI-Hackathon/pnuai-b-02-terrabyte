package com.terrabyte.backend.order;

import java.time.Instant;

public record ShopOrder(
        long id,
        String orderNumber,
        long userId,
        OrderStatus status,
        int totalQuantity,
        long totalPrice,
        String recipientName,
        String recipientPhone,
        String postalCode,
        String address,
        String addressDetail,
        Instant orderedAt,
        Instant updatedAt,
        Instant cancelledAt) {
}
