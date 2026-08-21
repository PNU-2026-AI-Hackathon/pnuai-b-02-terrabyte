package com.terrabyte.backend.payment;

public record ReadyPaymentResponse(
        long paymentId,
        long orderId,
        String orderNumber,
        long amount,
        String orderName,
        String customerName,
        String customerKey,
        String clientKey,
        String successUrl,
        String failUrl,
        PaymentStatus status) {
}
