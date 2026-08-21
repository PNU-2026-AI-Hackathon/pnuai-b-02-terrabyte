package com.terrabyte.backend.payment;

import java.time.Instant;

public record Payment(
        long id,
        long orderId,
        String provider,
        PaymentStatus status,
        long amount,
        String customerKey,
        String paymentKey,
        String method,
        String providerStatus,
        String failureCode,
        String failureMessage,
        String receiptUrl,
        String confirmIdempotencyKey,
        String cancelIdempotencyKey,
        boolean inventoryDeducted,
        Instant requestedAt,
        Instant updatedAt,
        Instant approvedAt,
        Instant cancelledAt) {
}
