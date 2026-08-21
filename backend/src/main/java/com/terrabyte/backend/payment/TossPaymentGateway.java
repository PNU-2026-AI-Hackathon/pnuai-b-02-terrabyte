package com.terrabyte.backend.payment;

import java.time.OffsetDateTime;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class TossPaymentGateway implements PaymentGateway {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public TossPaymentGateway(RestClient tossRestClient, ObjectMapper objectMapper) {
        this.restClient = tossRestClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public GatewayPayment confirm(
            String paymentKey,
            String orderNumber,
            long amount,
            String idempotencyKey) {
        return execute(() -> restClient.post()
                .uri("/v1/payments/confirm")
                .header("Idempotency-Key", idempotencyKey)
                .body(Map.of(
                        "paymentKey", paymentKey,
                        "orderId", orderNumber,
                        "amount", amount))
                .retrieve()
                .body(TossPaymentPayload.class));
    }

    @Override
    public GatewayPayment cancel(
            String paymentKey,
            String cancelReason,
            String idempotencyKey) {
        return execute(() -> restClient.post()
                .uri("/v1/payments/{paymentKey}/cancel", paymentKey)
                .header("Idempotency-Key", idempotencyKey)
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .body(Map.of("cancelReason", cancelReason))
                .retrieve()
                .body(TossPaymentPayload.class));
    }

    private GatewayPayment execute(GatewayCall call) {
        try {
            TossPaymentPayload payload = call.execute();
            if (payload == null) {
                throw new PaymentGatewayException(
                        "EMPTY_PAYMENT_RESPONSE",
                        "토스페이먼츠 응답이 비어 있습니다.",
                        false,
                        null);
            }
            return payload.toGatewayPayment();
        } catch (RestClientResponseException exception) {
            throw responseException(exception);
        } catch (PaymentGatewayException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new PaymentGatewayException(
                    "PAYMENT_GATEWAY_UNAVAILABLE",
                    "토스페이먼츠 응답을 확인할 수 없습니다. 같은 요청으로 다시 시도해 주세요.",
                    false,
                    exception);
        }
    }

    private PaymentGatewayException responseException(RestClientResponseException exception) {
        try {
            JsonNode error = objectMapper.readTree(exception.getResponseBodyAsString());
            String code = error.path("code").asText("PAYMENT_GATEWAY_REJECTED");
            String message = error.path("message").asText("토스페이먼츠가 결제를 거절했습니다.");
            return new PaymentGatewayException(code, message, true, exception);
        } catch (Exception parseFailure) {
            return new PaymentGatewayException(
                    "PAYMENT_GATEWAY_REJECTED",
                    "토스페이먼츠가 결제를 거절했습니다.",
                    true,
                    exception);
        }
    }

    @FunctionalInterface
    private interface GatewayCall {
        TossPaymentPayload execute();
    }

    private record TossPaymentPayload(
            String paymentKey,
            String orderId,
            String status,
            String method,
            long totalAmount,
            OffsetDateTime approvedAt,
            Receipt receipt) {

        private GatewayPayment toGatewayPayment() {
            return new GatewayPayment(
                    paymentKey,
                    orderId,
                    status,
                    method,
                    totalAmount,
                    approvedAt == null ? null : approvedAt.toInstant(),
                    receipt == null ? null : receipt.url());
        }
    }

    private record Receipt(String url) {
    }
}
