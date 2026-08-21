package com.terrabyte.backend.payment;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
import com.terrabyte.backend.cart.AddCartItemRequest;
import com.terrabyte.backend.order.CreateOrderRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PaymentApiIntegrationTests.GatewayTestConfig.class)
class PaymentApiIntegrationTests {

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;
    private final FakePaymentGateway paymentGateway;

    @Autowired
    PaymentApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate,
            FakePaymentGateway paymentGateway) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.paymentGateway = paymentGateway;
    }

    @BeforeEach
    void resetData() {
        jdbcTemplate.update("DELETE FROM app_user");
        jdbcTemplate.update("UPDATE product SET stock_quantity = 45 WHERE id = 'perlite'");
        paymentGateway.reset();
    }

    @Test
    void preparesConfirmsAndCancelsPaymentWithInventoryChanges() throws Exception {
        String authorization = authorization(signupToken("payment-flow@example.com"));
        addCartItem(authorization, "perlite", 2);
        JsonNode order = createOrder(authorization);
        long orderId = order.get("id").asLong();
        String orderNumber = order.get("orderNumber").asText();

        String readyBody = mockMvc.perform(post("/api/payments/ready")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content("{\"orderId\":" + orderId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(orderId))
                .andExpect(jsonPath("$.orderNumber").value(orderNumber))
                .andExpect(jsonPath("$.amount").value(9800))
                .andExpect(jsonPath("$.orderName").value("펄라이트 3L"))
                .andExpect(jsonPath("$.clientKey").value("test_ck_test_terrabyte"))
                .andExpect(jsonPath("$.customerKey").isNotEmpty())
                .andExpect(jsonPath("$.status").value("READY"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        long paymentId = objectMapper.readTree(readyBody).get("paymentId").asLong();

        mockMvc.perform(post("/api/payments/confirm")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(confirmBody("payment-key-1", orderNumber, 1)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAYMENT_AMOUNT_MISMATCH"));
        assertStock(45);

        mockMvc.perform(post("/api/payments/confirm")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(confirmBody("payment-key-1", orderNumber, 9800)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(paymentId))
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.amount").value(9800))
                .andExpect(jsonPath("$.method").value("카드"))
                .andExpect(jsonPath("$.providerStatus").value("DONE"))
                .andExpect(jsonPath("$.receiptUrl").value("https://example.test/receipt/payment-key-1"));
        assertStock(43);

        mockMvc.perform(get("/api/orders/{orderId}", orderId)
                        .header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        mockMvc.perform(get("/api/orders/{orderId}/payment", orderId)
                        .header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        mockMvc.perform(post("/api/payments/{paymentId}/cancel", paymentId)
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content("{\"cancelReason\":\"사용자 요청\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.providerStatus").value("CANCELED"));
        assertStock(45);

        mockMvc.perform(get("/api/orders/{orderId}", orderId)
                        .header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        mockMvc.perform(post("/api/payments/{paymentId}/cancel", paymentId)
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content("{\"cancelReason\":\"중복 요청\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertStock(45);
    }

    @Test
    void recordsWindowFailureAndAllowsPaymentToBePreparedAgain() throws Exception {
        String authorization = authorization(signupToken("payment-fail@example.com"));
        addCartItem(authorization, "perlite", 1);
        JsonNode order = createOrder(authorization);
        long orderId = order.get("id").asLong();
        String orderNumber = order.get("orderNumber").asText();
        prepare(authorization, orderId);

        mockMvc.perform(post("/api/payments/fail")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "orderId", orderNumber,
                                "code", "PAY_PROCESS_CANCELED",
                                "message", "사용자가 결제창을 닫았습니다."))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureCode").value("PAY_PROCESS_CANCELED"));

        mockMvc.perform(post("/api/payments/ready")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content("{\"orderId\":" + orderId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"));
    }

    @Test
    void releasesReservedInventoryWhenTossDefinitivelyRejectsConfirmation() throws Exception {
        String authorization = authorization(signupToken("payment-reject@example.com"));
        addCartItem(authorization, "perlite", 1);
        JsonNode order = createOrder(authorization);
        long orderId = order.get("id").asLong();
        String orderNumber = order.get("orderNumber").asText();
        prepare(authorization, orderId);
        paymentGateway.rejectNext();

        mockMvc.perform(post("/api/payments/confirm")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(confirmBody("rejected-key", orderNumber, 4900)))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("REJECT_CARD_PAYMENT"));

        assertStock(45);
        mockMvc.perform(get("/api/orders/{orderId}/payment", orderId)
                        .header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureCode").value("REJECT_CARD_PAYMENT"));
    }

    private void prepare(String authorization, long orderId) throws Exception {
        mockMvc.perform(post("/api/payments/ready")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content("{\"orderId\":" + orderId + "}"))
                .andExpect(status().isOk());
    }

    private JsonNode createOrder(String authorization) throws Exception {
        String response = mockMvc.perform(post("/api/orders")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateOrderRequest(
                                "김결제",
                                "010-1234-5678",
                                "46241",
                                "부산광역시 금정구 부산대학로",
                                null))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response);
    }

    private void addCartItem(String authorization, String productId, int quantity) throws Exception {
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new AddCartItemRequest(productId, quantity))))
                .andExpect(status().isOk());
    }

    private String signupToken(String email) throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password1", "결제 사용자"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asText();
    }

    private String confirmBody(String paymentKey, String orderNumber, long amount) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "paymentKey", paymentKey,
                "orderId", orderNumber,
                "amount", amount));
    }

    private void assertStock(int expected) {
        Integer actual = jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM product WHERE id = 'perlite'",
                Integer.class);
        org.assertj.core.api.Assertions.assertThat(actual).isEqualTo(expected);
    }

    private String authorization(String token) {
        return "Bearer " + token;
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class GatewayTestConfig {

        @Bean
        @Primary
        FakePaymentGateway fakePaymentGateway() {
            return new FakePaymentGateway();
        }
    }

    static class FakePaymentGateway implements PaymentGateway {

        private final Map<String, GatewayPayment> payments = new HashMap<>();
        private boolean rejectNext;

        @Override
        public GatewayPayment confirm(
                String paymentKey,
                String orderNumber,
                long amount,
                String idempotencyKey) {
            if (rejectNext) {
                rejectNext = false;
                throw new PaymentGatewayException(
                        "REJECT_CARD_PAYMENT",
                        "카드 결제가 거절되었습니다.",
                        true,
                        null);
            }
            GatewayPayment result = new GatewayPayment(
                    paymentKey,
                    orderNumber,
                    "DONE",
                    "카드",
                    amount,
                    Instant.now(),
                    "https://example.test/receipt/" + paymentKey);
            payments.put(paymentKey, result);
            return result;
        }

        @Override
        public GatewayPayment cancel(
                String paymentKey,
                String cancelReason,
                String idempotencyKey) {
            GatewayPayment paid = payments.get(paymentKey);
            if (paid == null) {
                throw new PaymentGatewayException(
                        "NOT_FOUND_PAYMENT",
                        "결제를 찾을 수 없습니다.",
                        true,
                        null);
            }
            return new GatewayPayment(
                    paid.paymentKey(),
                    paid.orderId(),
                    "CANCELED",
                    paid.method(),
                    paid.totalAmount(),
                    paid.approvedAt(),
                    paid.receiptUrl());
        }

        void rejectNext() {
            rejectNext = true;
        }

        void reset() {
            payments.clear();
            rejectNext = false;
        }
    }
}
