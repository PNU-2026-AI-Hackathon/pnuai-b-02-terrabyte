package com.terrabyte.backend.shop;

import java.util.List;
import java.util.Locale;

import com.terrabyte.backend.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class ShopCatalogService {

    private final ShopCatalogRepository catalogRepository;

    public ShopCatalogService(ShopCatalogRepository catalogRepository) {
        this.catalogRepository = catalogRepository;
    }

    public List<ShopProductResponse> findAll(
            String category, String subCategory, String query, boolean recommendedOnly) {
        return catalogRepository.findActive(category, subCategory, query, recommendedOnly).stream()
                .map(ShopProductResponse::from)
                .toList();
    }

    public ShopProductResponse findById(String productId) {
        String normalizedId = productId.trim().toLowerCase(Locale.ROOT);
        return catalogRepository.findActiveById(normalizedId)
                .map(ShopProductResponse::from)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "PRODUCT_NOT_FOUND",
                        "상품을 찾을 수 없습니다."));
    }
}
