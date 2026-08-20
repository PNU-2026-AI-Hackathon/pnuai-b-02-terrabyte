package com.terrabyte.backend.cart;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddCartItemRequest(
        @NotBlank(message = "상품 ID는 필수입니다.")
        @Size(max = 64, message = "상품 ID는 64자 이하여야 합니다.")
        String productId,
        @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
        @Max(value = 99, message = "한 상품은 최대 99개까지 담을 수 있습니다.")
        int quantity) {
}
