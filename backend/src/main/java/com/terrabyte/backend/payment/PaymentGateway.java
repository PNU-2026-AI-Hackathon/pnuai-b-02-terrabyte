package com.terrabyte.backend.payment;

public interface PaymentGateway {

    GatewayPayment confirm(
            String paymentKey,
            String orderNumber,
            long amount,
            String idempotencyKey);

    GatewayPayment cancel(
            String paymentKey,
            String cancelReason,
            String idempotencyKey);
}
