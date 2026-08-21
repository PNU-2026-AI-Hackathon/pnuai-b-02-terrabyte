package com.terrabyte.backend.shop;

public final class ProductPricing {

    private ProductPricing() {
    }

    public static int salePrice(int originalPrice, int discountRate) {
        if (originalPrice <= 0) {
            throw new IllegalArgumentException("Original price must be positive");
        }
        if (discountRate < 0 || discountRate > 90) {
            throw new IllegalArgumentException("Discount rate must be between 0 and 90");
        }
        int discountedPrice = Math.toIntExact((long) originalPrice * (100 - discountRate) / 100);
        return Math.max(1, discountedPrice);
    }
}
