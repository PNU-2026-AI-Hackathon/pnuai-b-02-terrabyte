package com.terrabyte.backend.admin;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/admin/products")
public class AdminProductController {

    private final AdminAccessService accessService;
    private final AdminProductService productService;

    public AdminProductController(
            AdminAccessService accessService,
            AdminProductService productService) {
        this.accessService = accessService;
        this.productService = productService;
    }

    @GetMapping
    public List<AdminProductResponse> findAll(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey) {
        accessService.requireAccess(adminApiKey);
        return productService.findAll();
    }

    @GetMapping("/{productId}")
    public AdminProductResponse findOne(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
            @PathVariable @Size(max = 64) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String productId) {
        accessService.requireAccess(adminApiKey);
        return productService.findOne(productId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminProductResponse create(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
            @Valid @RequestBody CreateAdminProductRequest request) {
        accessService.requireAccess(adminApiKey);
        return productService.create(request);
    }

    @PutMapping("/{productId}")
    public AdminProductResponse update(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
            @PathVariable @Size(max = 64) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String productId,
            @Valid @RequestBody UpdateAdminProductRequest request) {
        accessService.requireAccess(adminApiKey);
        return productService.update(productId, request);
    }

    @PatchMapping("/{productId}/stock")
    public AdminProductResponse updateStock(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
            @PathVariable @Size(max = 64) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String productId,
            @Valid @RequestBody UpdateProductStockRequest request) {
        accessService.requireAccess(adminApiKey);
        return productService.updateStock(productId, request);
    }
}
