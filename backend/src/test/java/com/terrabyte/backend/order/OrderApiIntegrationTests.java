package com.terrabyte.backend.order;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
import com.terrabyte.backend.cart.AddCartItemRequest;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OrderApiIntegrationTests {

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @Autowired
    OrderApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @BeforeEach
    void clearUsers() {
        jdbcTemplate.update("DELETE FROM app_user");
    }

    @Test
    void requiresAuthenticationAndRejectsAnEmptyCart() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

        String authorization = authorization(signupToken("order-empty@example.com"));

        mockMvc.perform(post("/api/orders")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(createOrderBody()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CART_EMPTY"));
    }

    @Test
    void createsAnOrderSnapshotAndClearsTheCart() throws Exception {
        String authorization = authorization(signupToken("order-create@example.com"));
        addCartItem(authorization, "perlite", 2);
        addCartItem(authorization, "basil-seeds", 1);

        String createResponse = mockMvc.perform(post("/api/orders")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(createOrderBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.orderNumber", Matchers.startsWith("ORD-")))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.totalQuantity").value(3))
                .andExpect(jsonPath("$.totalPrice").value(12950))
                .andExpect(jsonPath("$.recipientName").value("김테라"))
                .andExpect(jsonPath("$.postalCode").value("46241"))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].productId").value("perlite"))
                .andExpect(jsonPath("$.items[0].originalUnitPrice").value(4900))
                .andExpect(jsonPath("$.items[0].discountRate").value(0))
                .andExpect(jsonPath("$.items[0].unitPrice").value(4900))
                .andExpect(jsonPath("$.items[0].quantity").value(2))
                .andExpect(jsonPath("$.items[0].subtotal").value(9800))
                .andExpect(jsonPath("$.items[0].packageQuantity").value(3))
                .andExpect(jsonPath("$.items[0].packageUnit").value("L"))
                .andExpect(jsonPath("$.items[1].originalUnitPrice").value(3500))
                .andExpect(jsonPath("$.items[1].discountRate").value(10))
                .andExpect(jsonPath("$.items[1].unitPrice").value(3150))
                .andExpect(jsonPath("$.items[1].subtotal").value(3150))
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode created = objectMapper.readTree(createResponse);
        long orderId = created.get("id").asLong();

        mockMvc.perform(get("/api/cart").header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.totalQuantity").value(0));

        mockMvc.perform(get("/api/orders").header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(orderId))
                .andExpect(jsonPath("$[0].status").value("PENDING"))
                .andExpect(jsonPath("$[0].totalPrice").value(12950));

        mockMvc.perform(get("/api/orders/{orderId}", orderId)
                        .header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(orderId))
                .andExpect(jsonPath("$.items.length()").value(2));
    }

    @Test
    void isolatesOrdersByUserAndCancelsPendingOrdersIdempotently() throws Exception {
        String ownerAuthorization = authorization(signupToken("order-owner@example.com"));
        String otherAuthorization = authorization(signupToken("order-other@example.com"));
        addCartItem(ownerAuthorization, "perlite", 1);
        long orderId = createOrder(ownerAuthorization);

        mockMvc.perform(get("/api/orders/{orderId}", orderId)
                        .header("Authorization", otherAuthorization))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_FOUND"));

        mockMvc.perform(post("/api/orders/{orderId}/cancel", orderId)
                        .header("Authorization", ownerAuthorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelledAt").isNotEmpty());

        mockMvc.perform(post("/api/orders/{orderId}/cancel", orderId)
                        .header("Authorization", ownerAuthorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void rejectsInvalidShippingInformationAndNonPendingCancellation() throws Exception {
        String authorization = authorization(signupToken("order-validation@example.com"));
        addCartItem(authorization, "perlite", 1);

        mockMvc.perform(post("/api/orders")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateOrderRequest(
                                "",
                                "phone",
                                "123",
                                "",
                                null))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        long orderId = createOrder(authorization);
        jdbcTemplate.update(
                "UPDATE shop_order SET status = 'PAID' WHERE id = ?",
                orderId);

        mockMvc.perform(post("/api/orders/{orderId}/cancel", orderId)
                        .header("Authorization", authorization))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_CANNOT_BE_CANCELLED"));
    }

    private long createOrder(String authorization) throws Exception {
        String response = mockMvc.perform(post("/api/orders")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(createOrderBody()))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("id").asLong();
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
                                new SignupRequest(email, "password1", "주문 사용자"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asText();
    }

    private String authorization(String token) {
        return "Bearer " + token;
    }

    private String createOrderBody() throws Exception {
        return objectMapper.writeValueAsString(new CreateOrderRequest(
                "김테라",
                "010-1234-5678",
                "46241",
                "부산광역시 금정구 부산대학로 63번길",
                "제6공학관 101호"));
    }
}
