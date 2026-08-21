package com.terrabyte.backend.payment;

import java.time.Instant;

public record GatewayPayment(
        String paymentKey,
        String orderId,
        String status,
        String method,
        long totalAmount,
        Instant approvedAt,
        String receiptUrl) {
}
