package com.terrabyte.backend.cart;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public CartResponse findCart(@AuthenticationPrincipal Jwt jwt) {
        return cartService.findCart(userId(jwt));
    }

    @PostMapping("/items")
    public CartResponse addItem(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AddCartItemRequest request) {
        return cartService.addItem(userId(jwt), request);
    }

    @PatchMapping("/items/{productId}")
    public CartResponse updateItem(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable
            @NotBlank(message = "상품 ID는 필수입니다.")
            @Size(max = 64, message = "상품 ID는 64자 이하여야 합니다.")
            String productId,
            @Valid @RequestBody UpdateCartItemRequest request) {
        return cartService.updateItem(userId(jwt), productId, request);
    }

    @DeleteMapping("/items/{productId}")
    public CartResponse removeItem(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable
            @NotBlank(message = "상품 ID는 필수입니다.")
            @Size(max = 64, message = "상품 ID는 64자 이하여야 합니다.")
            String productId) {
        return cartService.removeItem(userId(jwt), productId);
    }

    @DeleteMapping
    public CartResponse clear(@AuthenticationPrincipal Jwt jwt) {
        return cartService.clear(userId(jwt));
    }

    private long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
