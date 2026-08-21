package com.terrabyte.backend.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record FailPaymentRequest(
        @NotBlank(message = "주문 번호는 필수입니다.")
        @Size(min = 6, max = 64, message = "주문 번호는 6자 이상 64자 이하여야 합니다.")
        String orderId,

        @NotBlank(message = "실패 코드는 필수입니다.")
        @Size(max = 100, message = "실패 코드는 100자 이하여야 합니다.")
        String code,

        @NotBlank(message = "실패 메시지는 필수입니다.")
        @Size(max = 300, message = "실패 메시지는 300자 이하여야 합니다.")
        String message) {
}
