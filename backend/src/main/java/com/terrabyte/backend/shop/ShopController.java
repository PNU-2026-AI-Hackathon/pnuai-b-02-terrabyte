package com.terrabyte.backend.shop;

import java.util.List;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/products")
public class ShopController {

    private final ShopCatalogService catalogService;

    public ShopController(ShopCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping
    public List<ShopProductResponse> findAll(
            @RequestParam(required = false)
            @Pattern(regexp = "parts|soil|seeds", message = "상품 카테고리가 올바르지 않습니다.")
            String category,
            @RequestParam(name = "subCategory", required = false)
            @Pattern(regexp = "SOIL|MEDIA|NUTRIENT", message = "상품 세부 카테고리가 올바르지 않습니다.")
            String subCategory,
            @RequestParam(required = false) @Size(max = 50) String q,
            @RequestParam(defaultValue = "false") boolean recommended) {
        return catalogService.findAll(category, subCategory, q, recommended);
    }

    @GetMapping("/{productId}")
    public ShopProductResponse findById(
            @PathVariable @Size(min = 1, max = 64) String productId) {
        return catalogService.findById(productId);
    }
}
