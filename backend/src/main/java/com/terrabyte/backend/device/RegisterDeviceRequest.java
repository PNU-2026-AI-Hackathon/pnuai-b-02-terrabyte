package com.terrabyte.backend.device;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterDeviceRequest(
        @NotBlank(message = "기기 코드를 입력해 주세요.")
        @Pattern(regexp = "^[0-9]{6}$", message = "기기 코드는 숫자 6자리여야 합니다.")
        String serialCode,

        @NotBlank(message = "공간 이름을 입력해 주세요.")
        @Size(max = 100, message = "공간 이름은 100자 이하여야 합니다.")
        String spaceName,

        @NotBlank(message = "공간 유형을 입력해 주세요.")
        @Size(max = 50, message = "공간 유형은 50자 이하여야 합니다.")
        String spaceType,

        @NotNull(message = "공간 면적을 입력해 주세요.")
        @DecimalMin(value = "0.01", message = "공간 면적은 0보다 커야 합니다.")
        @Digits(integer = 8, fraction = 2, message = "공간 면적은 소수점 둘째 자리까지 입력해 주세요.")
        BigDecimal areaSquareMeters) {
}
