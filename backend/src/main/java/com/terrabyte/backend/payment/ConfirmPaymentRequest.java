package com.terrabyte.backend.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record ConfirmPaymentRequest(
        @NotBlank(message = "결제 키는 필수입니다.")
        @Size(max = 200, message = "결제 키는 200자 이하여야 합니다.")
        String paymentKey,

        @NotBlank(message = "주문 번호는 필수입니다.")
        @Size(min = 6, max = 64, message = "주문 번호는 6자 이상 64자 이하여야 합니다.")
        String orderId,

        @Positive(message = "결제 금액은 0원보다 커야 합니다.")
        long amount) {
}
