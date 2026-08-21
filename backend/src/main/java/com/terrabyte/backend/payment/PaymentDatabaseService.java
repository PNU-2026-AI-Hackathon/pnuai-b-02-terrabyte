package com.terrabyte.backend.payment;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.order.OrderRepository;
import com.terrabyte.backend.order.OrderStatus;
import com.terrabyte.backend.order.ShopOrder;
import com.terrabyte.backend.order.ShopOrderItem;
import com.terrabyte.backend.shop.ShopCatalogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentDatabaseService {

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final ShopCatalogRepository catalogRepository;

    public PaymentDatabaseService(
            PaymentRepository paymentRepository,
            OrderRepository orderRepository,
            ShopCatalogRepository catalogRepository) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.catalogRepository = catalogRepository;
    }

    @Transactional
    public PaymentContext ready(long userId, long orderId) {
        ShopOrder order = requireOrderForUpdate(userId, orderId);
        if (order.status() != OrderStatus.PENDING) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ORDER_NOT_PAYABLE",
                    "결제할 수 있는 주문 상태가 아닙니다.");
        }

        Instant now = Instant.now();
        Payment payment = paymentRepository.findByOrderIdForUpdate(orderId)
                .map(existing -> prepareExisting(existing, now))
                .orElseGet(() -> paymentRepository.create(
                        orderId,
                        order.totalPrice(),
                        createCustomerKey(),
                        now));
        return context(payment, order);
    }

    @Transactional(readOnly = true)
    public PaymentContext find(long userId, long orderId) {
        ShopOrder order = requireOrder(userId, orderId);
        Payment payment = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "PAYMENT_NOT_FOUND",
                        "결제 정보를 찾을 수 없습니다."));
        return context(payment, order);
    }

    @Transactional
    public ConfirmationContext beginConfirm(long userId, ConfirmPaymentRequest request) {
        ShopOrder locatedOrder = orderRepository.findByOrderNumberAndUser(request.orderId(), userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "ORDER_NOT_FOUND",
                        "주문을 찾을 수 없습니다."));
        ShopOrder order = requireOrderForUpdate(userId, locatedOrder.id());
        Payment payment = paymentRepository.findByOrderIdForUpdate(order.id())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.CONFLICT,
                        "PAYMENT_NOT_READY",
                        "먼저 결제 준비 API를 호출해 주세요."));

        validateAmount(order, payment, request.amount());
        if (payment.status() == PaymentStatus.PAID) {
            if (!request.paymentKey().equals(payment.paymentKey())) {
                throw paymentConflict();
            }
            return new ConfirmationContext(payment, order, true);
        }
        if (order.status() != OrderStatus.PENDING
                || payment.status() == PaymentStatus.CANCELLED) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ORDER_NOT_PAYABLE",
                    "결제할 수 있는 주문 상태가 아닙니다.");
        }

        boolean alreadyConfirming = payment.status() == PaymentStatus.CONFIRMING;
        if (alreadyConfirming && !request.paymentKey().equals(payment.paymentKey())) {
            throw paymentConflict();
        }

        List<ShopOrderItem> items = orderRepository.findItems(order.id());
        if (!payment.inventoryDeducted()) {
            reserveInventory(items);
        }
        String idempotencyKey = alreadyConfirming && payment.confirmIdempotencyKey() != null
                ? payment.confirmIdempotencyKey()
                : UUID.randomUUID().toString();
        paymentRepository.markConfirming(
                payment.id(),
                request.paymentKey(),
                idempotencyKey,
                true,
                Instant.now());
        Payment confirming = paymentRepository.findByOrderId(order.id()).orElseThrow();
        return new ConfirmationContext(confirming, order, false);
    }

    @Transactional
    public PaymentContext completeConfirm(
            long userId,
            long orderId,
            GatewayPayment gatewayPayment) {
        ShopOrder order = requireOrderForUpdate(userId, orderId);
        Payment payment = requirePaymentForUpdate(orderId);
        if (payment.status() == PaymentStatus.PAID) {
            return context(payment, order);
        }
        if (payment.status() != PaymentStatus.CONFIRMING) {
            throw paymentConflict();
        }
        validateGatewayResult(order, payment, gatewayPayment, "DONE");

        Instant now = Instant.now();
        if (orderRepository.markPaid(orderId, userId, now) != 1) {
            throw paymentConflict();
        }
        paymentRepository.markPaid(payment.id(), gatewayPayment, now);
        return context(
                paymentRepository.findByOrderId(orderId).orElseThrow(),
                requireOrder(userId, orderId));
    }

    @Transactional
    public void failConfirm(long userId, long orderId, String code, String message) {
        requireOrderForUpdate(userId, orderId);
        Payment payment = requirePaymentForUpdate(orderId);
        if (payment.status() == PaymentStatus.PAID || payment.status() == PaymentStatus.CANCELLED) {
            return;
        }
        releaseInventory(payment, orderRepository.findItems(orderId));
        paymentRepository.markFailed(payment.id(), code, message, Instant.now());
    }

    @Transactional
    public PaymentContext recordFailure(long userId, FailPaymentRequest request) {
        ShopOrder locatedOrder = orderRepository.findByOrderNumberAndUser(request.orderId(), userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "ORDER_NOT_FOUND",
                        "주문을 찾을 수 없습니다."));
        ShopOrder order = requireOrderForUpdate(userId, locatedOrder.id());
        Payment payment = requirePaymentForUpdate(order.id());
        if (payment.status() == PaymentStatus.PAID || payment.status() == PaymentStatus.CANCELLED) {
            throw paymentConflict();
        }
        if (payment.status() == PaymentStatus.CONFIRMING) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "PAYMENT_CONFIRM_IN_PROGRESS",
                    "승인 결과 확인 중입니다. 같은 승인 요청으로 다시 시도해 주세요.");
        }
        paymentRepository.markFailed(
                payment.id(),
                request.code().trim(),
                request.message().trim(),
                Instant.now());
        return context(paymentRepository.findByOrderId(order.id()).orElseThrow(), order);
    }

    @Transactional
    public CancellationContext beginCancel(long userId, long paymentId) {
        Payment payment = paymentRepository.findByOrderIdForUpdate(paymentOrderId(paymentId, userId))
                .orElseThrow();
        ShopOrder order = requireOrderForUpdate(userId, payment.orderId());
        if (payment.status() == PaymentStatus.CANCELLED) {
            return new CancellationContext(payment, order, true);
        }
        if (payment.status() != PaymentStatus.PAID || order.status() != OrderStatus.PAID) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "PAYMENT_CANNOT_BE_CANCELLED",
                    "승인 완료된 결제만 취소할 수 있습니다.");
        }
        String idempotencyKey = payment.cancelIdempotencyKey() == null
                ? UUID.randomUUID().toString()
                : payment.cancelIdempotencyKey();
        paymentRepository.setCancelIdempotencyKey(payment.id(), idempotencyKey, Instant.now());
        return new CancellationContext(
                paymentRepository.findByOrderId(order.id()).orElseThrow(),
                order,
                false);
    }

    @Transactional
    public PaymentContext completeCancel(
            long userId,
            long orderId,
            GatewayPayment gatewayPayment) {
        ShopOrder order = requireOrderForUpdate(userId, orderId);
        Payment payment = requirePaymentForUpdate(orderId);
        if (payment.status() == PaymentStatus.CANCELLED) {
            return context(payment, order);
        }
        if (payment.status() != PaymentStatus.PAID) {
            throw paymentConflict();
        }
        validateGatewayResult(order, payment, gatewayPayment, "CANCELED");

        Instant now = Instant.now();
        if (orderRepository.cancelPaid(orderId, userId, now) != 1) {
            throw paymentConflict();
        }
        releaseInventory(payment, orderRepository.findItems(orderId));
        paymentRepository.markCancelled(payment.id(), gatewayPayment.status(), now);
        return context(
                paymentRepository.findByOrderId(orderId).orElseThrow(),
                requireOrder(userId, orderId));
    }

    private Payment prepareExisting(Payment payment, Instant now) {
        if (payment.status() == PaymentStatus.READY) {
            return payment;
        }
        if (payment.status() == PaymentStatus.FAILED && !payment.inventoryDeducted()) {
            paymentRepository.resetReady(payment.id(), now);
            return paymentRepository.findByOrderId(payment.orderId()).orElseThrow();
        }
        throw new ApiException(
                HttpStatus.CONFLICT,
                "PAYMENT_ALREADY_IN_PROGRESS",
                "이미 진행 중이거나 완료된 결제가 있습니다.");
    }

    private void validateAmount(ShopOrder order, Payment payment, long requestedAmount) {
        if (requestedAmount != order.totalPrice() || requestedAmount != payment.amount()) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "PAYMENT_AMOUNT_MISMATCH",
                    "주문 금액과 결제 금액이 일치하지 않습니다.");
        }
    }

    private void validateGatewayResult(
            ShopOrder order,
            Payment payment,
            GatewayPayment result,
            String expectedStatus) {
        if (!order.orderNumber().equals(result.orderId())
                || !payment.paymentKey().equals(result.paymentKey())
                || payment.amount() != result.totalAmount()
                || !expectedStatus.equals(result.status())) {
            throw new ApiException(
                    HttpStatus.BAD_GATEWAY,
                    "INVALID_PAYMENT_RESPONSE",
                    "결제사의 응답이 주문 정보와 일치하지 않습니다.");
        }
    }

    private void reserveInventory(List<ShopOrderItem> items) {
        for (ShopOrderItem item : items) {
            if (catalogRepository.decreaseStock(item.productId(), item.quantity()) != 1) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "INSUFFICIENT_STOCK",
                        item.productName() + " 상품의 재고가 부족합니다.");
            }
        }
    }

    private void releaseInventory(Payment payment, List<ShopOrderItem> items) {
        if (!payment.inventoryDeducted()) {
            return;
        }
        for (ShopOrderItem item : items) {
            catalogRepository.increaseStock(item.productId(), item.quantity());
        }
    }

    private long paymentOrderId(long paymentId, long userId) {
        return paymentRepository.findOrderIdByIdAndUserForUpdate(paymentId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "PAYMENT_NOT_FOUND",
                        "결제 정보를 찾을 수 없습니다."));
    }

    private Payment requirePaymentForUpdate(long orderId) {
        return paymentRepository.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "PAYMENT_NOT_FOUND",
                        "결제 정보를 찾을 수 없습니다."));
    }

    private ShopOrder requireOrder(long userId, long orderId) {
        return orderRepository.findByIdAndUser(orderId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "ORDER_NOT_FOUND",
                        "주문을 찾을 수 없습니다."));
    }

    private ShopOrder requireOrderForUpdate(long userId, long orderId) {
        return orderRepository.findByIdAndUserForUpdate(orderId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "ORDER_NOT_FOUND",
                        "주문을 찾을 수 없습니다."));
    }

    private PaymentContext context(Payment payment, ShopOrder order) {
        return new PaymentContext(payment, order, orderRepository.findItems(order.id()));
    }

    private String createCustomerKey() {
        return "customer-" + UUID.randomUUID().toString().replace("-", "").toLowerCase(Locale.ROOT);
    }

    private ApiException paymentConflict() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "PAYMENT_STATE_CONFLICT",
                "현재 결제 상태에서는 요청을 처리할 수 없습니다.");
    }

    public record PaymentContext(Payment payment, ShopOrder order, List<ShopOrderItem> items) {
    }

    public record ConfirmationContext(Payment payment, ShopOrder order, boolean alreadyPaid) {
    }

    public record CancellationContext(Payment payment, ShopOrder order, boolean alreadyCancelled) {
    }
}
