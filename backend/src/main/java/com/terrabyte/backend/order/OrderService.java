package com.terrabyte.backend.order;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.cart.CartLine;
import com.terrabyte.backend.cart.CartRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final CartRepository cartRepository;

    public OrderService(
            OrderRepository orderRepository,
            CartRepository cartRepository) {
        this.orderRepository = orderRepository;
        this.cartRepository = cartRepository;
    }

    @Transactional
    public OrderDetailResponse create(long userId, CreateOrderRequest request) {
        List<CartLine> cartLines = cartRepository.findLinesForUpdate(userId);
        if (cartLines.isEmpty()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "CART_EMPTY",
                    "장바구니가 비어 있습니다.");
        }

        validateProducts(cartLines);
        List<OrderItemSnapshot> items = cartLines.stream()
                .map(OrderItemSnapshot::from)
                .toList();
        int totalQuantity = items.stream().mapToInt(OrderItemSnapshot::quantity).sum();
        long totalPrice = items.stream().mapToLong(OrderItemSnapshot::subtotal).sum();
        Instant orderedAt = Instant.now();

        ShopOrder order = orderRepository.create(
                createOrderNumber(),
                userId,
                totalQuantity,
                totalPrice,
                request.recipientName().trim(),
                request.recipientPhone().trim(),
                request.postalCode().trim(),
                request.address().trim(),
                normalizeOptional(request.addressDetail()),
                orderedAt);
        orderRepository.saveItems(order.id(), items);
        cartRepository.clear(userId);
        return detail(order);
    }

    @Transactional(readOnly = true)
    public List<OrderSummaryResponse> findAll(long userId) {
        return orderRepository.findAllByUser(userId).stream()
                .map(OrderSummaryResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public OrderDetailResponse findOne(long userId, long orderId) {
        return detail(requireOwnedOrder(userId, orderId));
    }

    @Transactional
    public OrderDetailResponse cancel(long userId, long orderId) {
        ShopOrder order = requireOwnedOrder(userId, orderId);
        if (order.status() == OrderStatus.CANCELLED) {
            return detail(order);
        }
        if (order.status() != OrderStatus.PENDING) {
            throw cannotCancel();
        }

        int updated = orderRepository.cancel(orderId, userId, Instant.now());
        ShopOrder cancelledOrder = requireOwnedOrder(userId, orderId);
        if (updated == 0 && cancelledOrder.status() != OrderStatus.CANCELLED) {
            throw cannotCancel();
        }
        return detail(cancelledOrder);
    }

    private void validateProducts(List<CartLine> cartLines) {
        for (CartLine line : cartLines) {
            if (!"ACTIVE".equals(line.status())) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "PRODUCT_NOT_AVAILABLE",
                        line.name() + " 상품은 현재 구매할 수 없습니다.");
            }
            if (line.quantity() > line.stockQuantity()) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "INSUFFICIENT_STOCK",
                        line.name() + " 상품의 재고가 부족합니다.");
            }
        }
    }

    private ShopOrder requireOwnedOrder(long userId, long orderId) {
        return orderRepository.findByIdAndUser(orderId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "ORDER_NOT_FOUND",
                        "주문을 찾을 수 없습니다."));
    }

    private OrderDetailResponse detail(ShopOrder order) {
        return OrderDetailResponse.from(order, orderRepository.findItems(order.id()));
    }

    private String createOrderNumber() {
        String randomPart = UUID.randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 20)
                .toUpperCase(Locale.ROOT);
        return "ORD-" + randomPart;
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private ApiException cannotCancel() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "ORDER_CANNOT_BE_CANCELLED",
                "현재 상태에서는 주문을 취소할 수 없습니다.");
    }
}
