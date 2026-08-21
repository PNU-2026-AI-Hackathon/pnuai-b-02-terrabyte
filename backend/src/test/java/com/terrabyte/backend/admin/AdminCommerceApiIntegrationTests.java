package com.terrabyte.backend.admin;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
import com.terrabyte.backend.cart.AddCartItemRequest;
import com.terrabyte.backend.order.CreateOrderRequest;
import org.junit.jupiter.api.AfterEach;
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
class AdminCommerceApiIntegrationTests {

    private static final String ADMIN_KEY = "terrabyte-test-admin-key";
    private static final String TEST_PRODUCT_ID = "admin-test-product";

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @Autowired
    AdminCommerceApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @BeforeEach
    void resetData() {
        jdbcTemplate.update("DELETE FROM app_user");
        jdbcTemplate.update("DELETE FROM product WHERE id = ?", TEST_PRODUCT_ID);
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM app_user");
        jdbcTemplate.update("DELETE FROM product WHERE id = ?", TEST_PRODUCT_ID);
    }

    @Test
    void requiresJwtAndAdminKeyAndManagesProductsAndStock() throws Exception {
        mockMvc.perform(get("/api/admin/products")
                        .header("X-Admin-Key", ADMIN_KEY))
                .andExpect(status().isUnauthorized());

        String authorization = authorization(signupToken("admin-product@example.com"));
        mockMvc.perform(get("/api/admin/products")
                        .header("Authorization", authorization))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));

        mockMvc.perform(post("/api/admin/products")
                        .header("Authorization", authorization)
                        .header("X-Admin-Key", ADMIN_KEY)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.ofEntries(
                                Map.entry("id", TEST_PRODUCT_ID),
                                Map.entry("category", "parts"),
                                Map.entry("name", "관리자 테스트 상품"),
                                Map.entry("emoji", "🧰"),
                                Map.entry("description", "관리자 상품 등록 API 테스트"),
                                Map.entry("price", 12000),
                                Map.entry("discountRate", 10),
                                Map.entry("stockQuantity", 7),
                                Map.entry("status", "ACTIVE"),
                                Map.entry("packageQuantity", 1),
                                Map.entry("packageUnit", "개"),
                                Map.entry("displayOrder", 999)))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(TEST_PRODUCT_ID))
                .andExpect(jsonPath("$.discountRate").value(10))
                .andExpect(jsonPath("$.salePrice").value(10800))
                .andExpect(jsonPath("$.stockQuantity").value(7))
                .andExpect(jsonPath("$.available").value(true));

        mockMvc.perform(put("/api/admin/products/{productId}", TEST_PRODUCT_ID)
                        .header("Authorization", authorization)
                        .header("X-Admin-Key", ADMIN_KEY)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.ofEntries(
                                Map.entry("category", "parts"),
                                Map.entry("name", "수정된 관리자 테스트 상품"),
                                Map.entry("emoji", "🛠️"),
                                Map.entry("description", "관리자 상품 수정 API 테스트"),
                                Map.entry("price", 13500),
                                Map.entry("discountRate", 20),
                                Map.entry("badge", "추천"),
                                Map.entry("status", "ACTIVE"),
                                Map.entry("packageQuantity", 1),
                                Map.entry("packageUnit", "개"),
                                Map.entry("displayOrder", 999)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("수정된 관리자 테스트 상품"))
                .andExpect(jsonPath("$.price").value(13500))
                .andExpect(jsonPath("$.discountRate").value(20))
                .andExpect(jsonPath("$.salePrice").value(10800))
                .andExpect(jsonPath("$.badge").value("추천"))
                .andExpect(jsonPath("$.stockQuantity").value(7));

        mockMvc.perform(patch("/api/admin/products/{productId}/stock", TEST_PRODUCT_ID)
                        .header("Authorization", authorization)
                        .header("X-Admin-Key", ADMIN_KEY)
                        .contentType(APPLICATION_JSON)
                        .content("{\"stockQuantity\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stockQuantity").value(0))
                .andExpect(jsonPath("$.available").value(false));

        mockMvc.perform(get("/api/products/{productId}", TEST_PRODUCT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false));
    }

    @Test
    void listsOrdersAndEnforcesShippingStatusSequence() throws Exception {
        String authorization = authorization(signupToken("admin-order@example.com"));
        addCartItem(authorization, "perlite", 1);
        long orderId = createOrder(authorization).get("id").asLong();
        jdbcTemplate.update(
                "UPDATE shop_order SET status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                orderId);

        mockMvc.perform(get("/api/admin/orders")
                        .queryParam("status", "PAID")
                        .header("Authorization", authorization)
                        .header("X-Admin-Key", ADMIN_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(orderId))
                .andExpect(jsonPath("$[0].status").value("PAID"));

        updateStatus(authorization, orderId, "SHIPPED")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_ORDER_STATUS_TRANSITION"));

        updateStatus(authorization, orderId, "PREPARING")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PREPARING"));
        updateStatus(authorization, orderId, "SHIPPED")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SHIPPED"));
        updateStatus(authorization, orderId, "DELIVERED")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELIVERED"));

        mockMvc.perform(get("/api/admin/orders/{orderId}", orderId)
                        .header("Authorization", authorization)
                        .header("X-Admin-Key", ADMIN_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(orderId))
                .andExpect(jsonPath("$.status").value("DELIVERED"))
                .andExpect(jsonPath("$.items[0].productId").value("perlite"));
    }

    private org.springframework.test.web.servlet.ResultActions updateStatus(
            String authorization,
            long orderId,
            String statusValue) throws Exception {
        return mockMvc.perform(patch("/api/admin/orders/{orderId}/status", orderId)
                .header("Authorization", authorization)
                .header("X-Admin-Key", ADMIN_KEY)
                .contentType(APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("status", statusValue))));
    }

    private void addCartItem(String authorization, String productId, int quantity) throws Exception {
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new AddCartItemRequest(productId, quantity))))
                .andExpect(status().isOk());
    }

    private JsonNode createOrder(String authorization) throws Exception {
        String response = mockMvc.perform(post("/api/orders")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateOrderRequest(
                                "관리자 테스트",
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

    private String signupToken(String email) throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password1", "관리자 API 테스트"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asText();
    }

    private String authorization(String token) {
        return "Bearer " + token;
    }
}
