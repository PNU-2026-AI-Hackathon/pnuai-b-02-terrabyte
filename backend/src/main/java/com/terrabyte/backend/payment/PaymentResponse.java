package com.terrabyte.backend.payment;

import java.time.Instant;

public record PaymentResponse(
        long id,
        long orderId,
        String orderNumber,
        String provider,
        PaymentStatus status,
        long amount,
        String paymentKey,
        String method,
        String providerStatus,
        String failureCode,
        String failureMessage,
        String receiptUrl,
        Instant requestedAt,
        Instant approvedAt,
        Instant cancelledAt) {

    static PaymentResponse from(Payment payment, String orderNumber) {
        return new PaymentResponse(
                payment.id(),
                payment.orderId(),
                orderNumber,
                payment.provider(),
                payment.status(),
                payment.amount(),
                payment.paymentKey(),
                payment.method(),
                payment.providerStatus(),
                payment.failureCode(),
                payment.failureMessage(),
                payment.receiptUrl(),
                payment.requestedAt(),
                payment.approvedAt(),
                payment.cancelledAt());
    }
}
