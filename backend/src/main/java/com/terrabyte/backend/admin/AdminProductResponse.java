package com.terrabyte.backend.admin;

import java.math.BigDecimal;
import java.time.Instant;

import com.terrabyte.backend.shop.ProductPricing;
import com.terrabyte.backend.shop.ShopProduct;

public record AdminProductResponse(
        String id,
        String category,
        String name,
        String emoji,
        String description,
        int price,
        int discountRate,
        int salePrice,
        boolean discounted,
        String badge,
        int stockQuantity,
        String status,
        boolean available,
        String imageUrl,
        BigDecimal packageQuantity,
        String packageUnit,
        String subCategory,
        int displayOrder,
        Instant createdAt,
        Instant updatedAt) {

    public static AdminProductResponse from(ShopProduct product) {
        return new AdminProductResponse(
                product.id(),
                product.category(),
                product.name(),
                product.emoji(),
                product.description(),
                product.price(),
                product.discountRate(),
                ProductPricing.salePrice(product.price(), product.discountRate()),
                product.discountRate() > 0,
                product.badge(),
                product.stockQuantity(),
                product.status(),
                "ACTIVE".equals(product.status()) && product.stockQuantity() > 0,
                product.imageUrl(),
                product.packageQuantity(),
                product.packageUnit(),
                product.subCategory(),
                product.displayOrder(),
                product.createdAt(),
                product.updatedAt());
    }
}
