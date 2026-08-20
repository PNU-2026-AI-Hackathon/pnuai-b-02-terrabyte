package com.terrabyte.backend.cart;

import java.util.List;

public record CartResponse(
        List<CartItemResponse> items,
        int totalQuantity,
        long totalPrice) {

    public CartResponse {
        items = List.copyOf(items);
    }

    public static CartResponse from(List<CartLine> lines) {
        List<CartItemResponse> items = lines.stream()
                .map(CartItemResponse::from)
                .toList();
        int totalQuantity = items.stream()
                .mapToInt(CartItemResponse::quantity)
                .sum();
        long totalPrice = items.stream()
                .mapToLong(CartItemResponse::subtotal)
                .sum();
        return new CartResponse(items, totalQuantity, totalPrice);
    }

    public static CartResponse empty() {
        return new CartResponse(List.of(), 0, 0);
    }
}
