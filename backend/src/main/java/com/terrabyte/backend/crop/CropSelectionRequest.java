package com.terrabyte.backend.crop;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CropSelectionRequest(
        @NotBlank @Size(max = 50) String cropCode) {
}
