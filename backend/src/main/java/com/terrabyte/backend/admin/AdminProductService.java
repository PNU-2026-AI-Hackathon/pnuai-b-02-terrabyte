package com.terrabyte.backend.admin;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.shop.ShopCatalogRepository;
import com.terrabyte.backend.shop.ShopProduct;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminProductService {

    private final ShopCatalogRepository catalogRepository;

    public AdminProductService(ShopCatalogRepository catalogRepository) {
        this.catalogRepository = catalogRepository;
    }

    @Transactional(readOnly = true)
    public List<AdminProductResponse> findAll() {
        return catalogRepository.findAllForAdmin().stream()
                .map(AdminProductResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public AdminProductResponse findOne(String productId) {
        return AdminProductResponse.from(requireProduct(normalizeId(productId)));
    }

    @Transactional
    public AdminProductResponse create(CreateAdminProductRequest request) {
        String productId = normalizeId(request.id());
        validateClassification(request.category(), request.subCategory());
        Instant now = Instant.now();
        ShopProduct product = new ShopProduct(
                productId,
                request.category(),
                request.name().trim(),
                request.emoji().trim(),
                request.description().trim(),
                request.price(),
                request.discountRate(),
                normalizeOptional(request.badge()),
                request.stockQuantity(),
                request.status(),
                normalizeOptional(request.imageUrl()),
                request.packageQuantity(),
                request.packageUnit(),
                request.subCategory(),
                request.displayOrder(),
                now,
                now);
        try {
            catalogRepository.create(product);
        } catch (DuplicateKeyException exception) {
            throw duplicateProduct();
        }
        return AdminProductResponse.from(requireProduct(productId));
    }

    @Transactional
    public AdminProductResponse update(String productId, UpdateAdminProductRequest request) {
        String normalizedId = normalizeId(productId);
        ShopProduct current = requireProduct(normalizedId);
        validateClassification(request.category(), request.subCategory());
        ShopProduct updated = new ShopProduct(
                current.id(),
                request.category(),
                request.name().trim(),
                request.emoji().trim(),
                request.description().trim(),
                request.price(),
                request.discountRate(),
                normalizeOptional(request.badge()),
                current.stockQuantity(),
                request.status(),
                normalizeOptional(request.imageUrl()),
                request.packageQuantity(),
                request.packageUnit(),
                request.subCategory(),
                request.displayOrder(),
                current.createdAt(),
                Instant.now());
        try {
            if (catalogRepository.update(updated) != 1) {
                throw productNotFound();
            }
        } catch (DuplicateKeyException exception) {
            throw duplicateProduct();
        }
        return AdminProductResponse.from(requireProduct(normalizedId));
    }

    @Transactional
    public AdminProductResponse updateStock(String productId, UpdateProductStockRequest request) {
        String normalizedId = normalizeId(productId);
        requireProduct(normalizedId);
        if (catalogRepository.setStock(normalizedId, request.stockQuantity(), Instant.now()) != 1) {
            throw productNotFound();
        }
        return AdminProductResponse.from(requireProduct(normalizedId));
    }

    private void validateClassification(String category, String subCategory) {
        boolean soilProduct = "soil".equals(category);
        if ((soilProduct && subCategory == null) || (!soilProduct && subCategory != null)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_PRODUCT_CLASSIFICATION",
                    "흙과 배지 상품만 세부 카테고리를 가져야 합니다.");
        }
    }

    private ShopProduct requireProduct(String productId) {
        return catalogRepository.findById(productId)
                .orElseThrow(this::productNotFound);
    }

    private String normalizeId(String productId) {
        return productId.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private ApiException productNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "PRODUCT_NOT_FOUND",
                "상품을 찾을 수 없습니다.");
    }

    private ApiException duplicateProduct() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "PRODUCT_DUPLICATE",
                "상품 ID, 상품명 또는 진열 순서가 이미 사용 중입니다.");
    }
}
