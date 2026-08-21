package com.terrabyte.backend.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CancelPaymentRequest(
        @NotBlank(message = "취소 사유는 필수입니다.")
        @Size(max = 200, message = "취소 사유는 200자 이하여야 합니다.")
        String cancelReason) {
}
