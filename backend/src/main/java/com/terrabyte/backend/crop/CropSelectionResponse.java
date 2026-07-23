package com.terrabyte.backend.crop;

import java.time.Instant;

public record CropSelectionResponse(
        long deviceId,
        CropResponse crop,
        Instant selectedAt) {
}
