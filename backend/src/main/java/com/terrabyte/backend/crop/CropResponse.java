package com.terrabyte.backend.crop;

public record CropResponse(
        String code,
        String name,
        String emoji,
        String description) {

    public static CropResponse from(Crop crop) {
        return new CropResponse(crop.code(), crop.name(), crop.emoji(), crop.description());
    }
}
