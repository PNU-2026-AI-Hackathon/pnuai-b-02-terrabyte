package com.terrabyte.backend.cart;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record UpdateCartItemRequest(
        @Min(value = 1, message = "수량은 1개 이상이어야 합니다.")
        @Max(value = 99, message = "한 상품은 최대 99개까지 담을 수 있습니다.")
        int quantity) {
}
