package com.terrabyte.backend.order;

import java.time.Instant;
import java.util.List;

public record OrderDetailResponse(
        long id,
        String orderNumber,
        OrderStatus status,
        int totalQuantity,
        long totalPrice,
        String recipientName,
        String recipientPhone,
        String postalCode,
        String address,
        String addressDetail,
        List<OrderItemResponse> items,
        Instant orderedAt,
        Instant updatedAt,
        Instant cancelledAt) {

    public OrderDetailResponse {
        items = List.copyOf(items);
    }

    public static OrderDetailResponse from(ShopOrder order, List<ShopOrderItem> items) {
        return new OrderDetailResponse(
                order.id(),
                order.orderNumber(),
                order.status(),
                order.totalQuantity(),
                order.totalPrice(),
                order.recipientName(),
                order.recipientPhone(),
                order.postalCode(),
                order.address(),
                order.addressDetail(),
                items.stream().map(OrderItemResponse::from).toList(),
                order.orderedAt(),
                order.updatedAt(),
                order.cancelledAt());
    }
}
