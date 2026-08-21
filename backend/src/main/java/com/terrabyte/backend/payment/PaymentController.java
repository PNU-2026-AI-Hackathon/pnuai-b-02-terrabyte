package com.terrabyte.backend.payment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping("/api/payments/ready")
    public ReadyPaymentResponse ready(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ReadyPaymentRequest request) {
        return paymentService.ready(userId(jwt), request);
    }

    @PostMapping("/api/payments/confirm")
    public PaymentResponse confirm(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ConfirmPaymentRequest request) {
        return paymentService.confirm(userId(jwt), request);
    }

    @PostMapping("/api/payments/fail")
    public PaymentResponse fail(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody FailPaymentRequest request) {
        return paymentService.fail(userId(jwt), request);
    }

    @PostMapping("/api/payments/{paymentId}/cancel")
    public PaymentResponse cancel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable @Positive(message = "결제 ID는 양수여야 합니다.") long paymentId,
            @Valid @RequestBody CancelPaymentRequest request) {
        return paymentService.cancel(userId(jwt), paymentId, request);
    }

    @GetMapping("/api/orders/{orderId}/payment")
    public PaymentResponse find(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable @Positive(message = "주문 ID는 양수여야 합니다.") long orderId) {
        return paymentService.find(userId(jwt), orderId);
    }

    private long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
