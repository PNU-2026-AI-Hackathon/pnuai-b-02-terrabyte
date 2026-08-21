package com.terrabyte.backend.admin;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record CreateAdminProductRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*", message = "상품 ID는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.")
        String id,
        @NotBlank
        @Pattern(regexp = "parts|soil|seeds", message = "상품 카테고리가 올바르지 않습니다.")
        String category,
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(max = 20) String emoji,
        @NotBlank @Size(max = 300) String description,
        @NotNull @Positive Integer price,
        @NotNull @Min(0) @Max(90) Integer discountRate,
        @Pattern(regexp = "추천", message = "상품 배지는 추천만 사용할 수 있습니다.") String badge,
        @NotNull @PositiveOrZero Integer stockQuantity,
        @NotBlank
        @Pattern(regexp = "ACTIVE|INACTIVE|DISCONTINUED", message = "상품 상태가 올바르지 않습니다.")
        String status,
        @Size(max = 500) String imageUrl,
        @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal packageQuantity,
        @NotBlank
        @Pattern(regexp = "개|세트|L|ml|g|립|구", message = "상품 단위가 올바르지 않습니다.")
        String packageUnit,
        @Pattern(regexp = "SOIL|MEDIA|NUTRIENT", message = "상품 세부 카테고리가 올바르지 않습니다.")
        String subCategory,
        @NotNull @Positive Integer displayOrder) {
}
