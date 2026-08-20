package com.terrabyte.backend.cart;

import java.util.Locale;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.shop.ShopCatalogRepository;
import com.terrabyte.backend.shop.ShopProduct;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CartService {

    private final CartRepository cartRepository;
    private final ShopCatalogRepository catalogRepository;

    public CartService(
            CartRepository cartRepository,
            ShopCatalogRepository catalogRepository) {
        this.cartRepository = cartRepository;
        this.catalogRepository = catalogRepository;
    }

    @Transactional(readOnly = true)
    public CartResponse findCart(long userId) {
        return CartResponse.from(cartRepository.findLines(userId));
    }

    @Transactional
    public CartResponse addItem(long userId, AddCartItemRequest request) {
        String productId = normalizeProductId(request.productId());
        ShopProduct product = requireActiveProduct(productId);
        int currentQuantity = cartRepository.findItemQuantity(userId, productId).orElse(0);
        int nextQuantity = currentQuantity + request.quantity();
        validateStock(product, nextQuantity);
        cartRepository.saveItemQuantity(userId, productId, nextQuantity);
        return findCart(userId);
    }

    @Transactional
    public CartResponse updateItem(long userId, String productId, UpdateCartItemRequest request) {
        String normalizedProductId = normalizeProductId(productId);
        ShopProduct product = requireActiveProduct(normalizedProductId);
        if (cartRepository.findItemQuantity(userId, normalizedProductId).isEmpty()) {
            throw new ApiException(
                    HttpStatus.NOT_FOUND,
                    "CART_ITEM_NOT_FOUND",
                    "장바구니에서 상품을 찾을 수 없습니다.");
        }
        validateStock(product, request.quantity());
        cartRepository.saveItemQuantity(userId, normalizedProductId, request.quantity());
        return findCart(userId);
    }

    @Transactional
    public CartResponse removeItem(long userId, String productId) {
        cartRepository.deleteItem(userId, normalizeProductId(productId));
        return findCart(userId);
    }

    @Transactional
    public CartResponse clear(long userId) {
        cartRepository.clear(userId);
        return findCart(userId);
    }

    private ShopProduct requireActiveProduct(String productId) {
        ShopProduct product = catalogRepository.findActiveById(productId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "PRODUCT_NOT_FOUND",
                        "상품을 찾을 수 없습니다."));
        if (product.stockQuantity() <= 0) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "PRODUCT_OUT_OF_STOCK",
                    "품절된 상품입니다.");
        }
        return product;
    }

    private void validateStock(ShopProduct product, int quantity) {
        if (quantity > product.stockQuantity()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "INSUFFICIENT_STOCK",
                    "재고 수량을 초과할 수 없습니다.");
        }
    }

    private String normalizeProductId(String productId) {
        return productId.trim().toLowerCase(Locale.ROOT);
    }
}
