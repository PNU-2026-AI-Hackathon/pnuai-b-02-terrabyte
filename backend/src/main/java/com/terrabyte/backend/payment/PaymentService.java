package com.terrabyte.backend.payment;

import java.util.List;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.order.ShopOrderItem;
import com.terrabyte.backend.payment.PaymentDatabaseService.CancellationContext;
import com.terrabyte.backend.payment.PaymentDatabaseService.ConfirmationContext;
import com.terrabyte.backend.payment.PaymentDatabaseService.PaymentContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class PaymentService {

    private final PaymentDatabaseService databaseService;
    private final PaymentGateway paymentGateway;
    private final TossPaymentProperties properties;

    public PaymentService(
            PaymentDatabaseService databaseService,
            PaymentGateway paymentGateway,
            TossPaymentProperties properties) {
        this.databaseService = databaseService;
        this.paymentGateway = paymentGateway;
        this.properties = properties;
    }

    public ReadyPaymentResponse ready(long userId, ReadyPaymentRequest request) {
        requireConfigured();
        PaymentContext context = databaseService.ready(userId, request.orderId());
        return new ReadyPaymentResponse(
                context.payment().id(),
                context.order().id(),
                context.order().orderNumber(),
                context.payment().amount(),
                orderName(context.items()),
                context.order().recipientName(),
                context.payment().customerKey(),
                properties.clientKey(),
                properties.successUrl(),
                properties.failUrl(),
                context.payment().status());
    }

    public PaymentResponse confirm(long userId, ConfirmPaymentRequest request) {
        requireConfigured();
        ConfirmationContext context = databaseService.beginConfirm(userId, request);
        if (context.alreadyPaid()) {
            return PaymentResponse.from(context.payment(), context.order().orderNumber());
        }

        GatewayPayment gatewayPayment;
        try {
            gatewayPayment = paymentGateway.confirm(
                    request.paymentKey(),
                    context.order().orderNumber(),
                    context.payment().amount(),
                    context.payment().confirmIdempotencyKey());
        } catch (PaymentGatewayException exception) {
            if (exception.definitive()) {
                databaseService.failConfirm(
                        userId,
                        context.order().id(),
                        exception.code(),
                        exception.getMessage());
            }
            throw new ApiException(
                    HttpStatus.BAD_GATEWAY,
                    exception.code(),
                    exception.getMessage());
        }

        PaymentContext completed = databaseService.completeConfirm(
                userId,
                context.order().id(),
                gatewayPayment);
        return PaymentResponse.from(completed.payment(), completed.order().orderNumber());
    }

    public PaymentResponse find(long userId, long orderId) {
        PaymentContext context = databaseService.find(userId, orderId);
        return PaymentResponse.from(context.payment(), context.order().orderNumber());
    }

    public PaymentResponse fail(long userId, FailPaymentRequest request) {
        PaymentContext context = databaseService.recordFailure(userId, request);
        return PaymentResponse.from(context.payment(), context.order().orderNumber());
    }

    public PaymentResponse cancel(long userId, long paymentId, CancelPaymentRequest request) {
        requireConfigured();
        CancellationContext context = databaseService.beginCancel(userId, paymentId);
        if (context.alreadyCancelled()) {
            return PaymentResponse.from(context.payment(), context.order().orderNumber());
        }

        GatewayPayment gatewayPayment;
        try {
            gatewayPayment = paymentGateway.cancel(
                    context.payment().paymentKey(),
                    request.cancelReason().trim(),
                    context.payment().cancelIdempotencyKey());
        } catch (PaymentGatewayException exception) {
            throw new ApiException(
                    HttpStatus.BAD_GATEWAY,
                    exception.code(),
                    exception.getMessage());
        }

        PaymentContext completed = databaseService.completeCancel(
                userId,
                context.order().id(),
                gatewayPayment);
        return PaymentResponse.from(completed.payment(), completed.order().orderNumber());
    }

    private String orderName(List<ShopOrderItem> items) {
        if (items.isEmpty()) {
            return "테라바이트 상품";
        }
        String firstName = items.get(0).productName();
        return items.size() == 1 ? firstName : firstName + " 외 " + (items.size() - 1) + "건";
    }

    private void requireConfigured() {
        if (!properties.configured()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "PAYMENT_NOT_CONFIGURED",
                    "토스페이먼츠 테스트 키가 설정되지 않았습니다.");
        }
    }
}
