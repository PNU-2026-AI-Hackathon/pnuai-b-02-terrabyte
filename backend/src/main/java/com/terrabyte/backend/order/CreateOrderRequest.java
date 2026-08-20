package com.terrabyte.backend.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateOrderRequest(
        @NotBlank(message = "받는 분 이름은 필수입니다.")
        @Size(max = 50, message = "받는 분 이름은 50자 이하여야 합니다.")
        String recipientName,
        @NotBlank(message = "연락처는 필수입니다.")
        @Pattern(
                regexp = "^[0-9+()\\- ]{8,20}$",
                message = "연락처 형식을 확인해 주세요.")
        String recipientPhone,
        @NotBlank(message = "우편번호는 필수입니다.")
        @Pattern(regexp = "^\\d{5}$", message = "우편번호는 숫자 5자리여야 합니다.")
        String postalCode,
        @NotBlank(message = "주소는 필수입니다.")
        @Size(max = 200, message = "주소는 200자 이하여야 합니다.")
        String address,
        @Size(max = 200, message = "상세 주소는 200자 이하여야 합니다.")
        String addressDetail) {
}
