package com.terrabyte.backend.shop;

import java.math.BigDecimal;

public record ShopProductResponse(
        String id,
        String category,
        String name,
        String emoji,
        String desc,
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
        String subCategory) {

    public static ShopProductResponse from(ShopProduct product) {
        return new ShopProductResponse(
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
                product.subCategory());
    }
}
