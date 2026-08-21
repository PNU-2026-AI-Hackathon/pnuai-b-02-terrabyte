package com.terrabyte.backend.payment;

import jakarta.validation.constraints.Positive;

public record ReadyPaymentRequest(
        @Positive(message = "주문 ID는 양수여야 합니다.")
        long orderId) {
}
