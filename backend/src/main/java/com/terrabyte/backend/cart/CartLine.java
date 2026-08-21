package com.terrabyte.backend.cart;

import java.math.BigDecimal;

import com.terrabyte.backend.shop.ProductPricing;

public record CartLine(
        String productId,
        String category,
        String name,
        String emoji,
        String description,
        int price,
        int discountRate,
        String badge,
        int quantity,
        int stockQuantity,
        String status,
        String imageUrl,
        BigDecimal packageQuantity,
        String packageUnit,
        String subCategory) {

    public int salePrice() {
        return ProductPricing.salePrice(price, discountRate);
    }
}
