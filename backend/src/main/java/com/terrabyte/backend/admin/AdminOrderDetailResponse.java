package com.terrabyte.backend.admin;

import java.time.Instant;
import java.util.List;

import com.terrabyte.backend.order.OrderItemResponse;
import com.terrabyte.backend.order.OrderStatus;
import com.terrabyte.backend.order.ShopOrder;
import com.terrabyte.backend.order.ShopOrderItem;

public record AdminOrderDetailResponse(
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
        List<OrderItemResponse> items,
        Instant orderedAt,
        Instant updatedAt,
        Instant cancelledAt) {

    public AdminOrderDetailResponse {
        items = List.copyOf(items);
    }

    public static AdminOrderDetailResponse from(ShopOrder order, List<ShopOrderItem> items) {
        return new AdminOrderDetailResponse(
                order.id(),
                order.orderNumber(),
                order.userId(),
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
