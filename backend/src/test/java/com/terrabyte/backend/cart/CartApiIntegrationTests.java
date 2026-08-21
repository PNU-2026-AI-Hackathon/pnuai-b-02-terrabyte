package com.terrabyte.backend.cart;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
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
class CartApiIntegrationTests {

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @Autowired
    CartApiIntegrationTests(
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
    void requiresAuthenticationAndStartsWithAnEmptyCart() throws Exception {
        mockMvc.perform(get("/api/cart"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

        String token = signupToken("cart-empty@example.com");

        mockMvc.perform(get("/api/cart").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.totalQuantity").value(0))
                .andExpect(jsonPath("$.totalPrice").value(0));
    }

    @Test
    void supportsAddingUpdatingRemovingAndClearingItems() throws Exception {
        String token = signupToken("cart-user@example.com");
        String authorization = "Bearer " + token;

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(addItemBody("perlite", 2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].productId").value("perlite"))
                .andExpect(jsonPath("$.items[0].name").value("펄라이트 3L"))
                .andExpect(jsonPath("$.items[0].quantity").value(2))
                .andExpect(jsonPath("$.items[0].price").value(4900))
                .andExpect(jsonPath("$.items[0].subtotal").value(9800))
                .andExpect(jsonPath("$.totalQuantity").value(2))
                .andExpect(jsonPath("$.totalPrice").value(9800));

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(addItemBody("perlite", 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].quantity").value(3));

        mockMvc.perform(patch("/api/cart/items/{productId}", "perlite")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(updateItemBody(4)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].quantity").value(4))
                .andExpect(jsonPath("$.totalPrice").value(19600));

        mockMvc.perform(delete("/api/cart/items/{productId}", "perlite")
                        .header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", authorization)
                        .contentType(APPLICATION_JSON)
                        .content(addItemBody("basil-seeds", 2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].price").value(3500))
                .andExpect(jsonPath("$.items[0].discountRate").value(10))
                .andExpect(jsonPath("$.items[0].salePrice").value(3150))
                .andExpect(jsonPath("$.items[0].subtotal").value(6300))
                .andExpect(jsonPath("$.totalPrice").value(6300));

        mockMvc.perform(delete("/api/cart")
                        .header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.totalQuantity").value(0));
    }

    @Test
    void isolatesCartItemsByUserAndValidatesProductAndStock() throws Exception {
        String firstToken = signupToken("cart-first@example.com");
        String secondToken = signupToken("cart-second@example.com");

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + firstToken)
                        .contentType(APPLICATION_JSON)
                        .content(addItemBody("perlite", 1)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/cart").header("Authorization", "Bearer " + secondToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + firstToken)
                        .contentType(APPLICATION_JSON)
                        .content(addItemBody("unknown-product", 1)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PRODUCT_NOT_FOUND"));

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + firstToken)
                        .contentType(APPLICATION_JSON)
                        .content(addItemBody("perlite", 46)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_STOCK"));

        mockMvc.perform(patch("/api/cart/items/{productId}", "basil-seeds")
                        .header("Authorization", "Bearer " + firstToken)
                        .contentType(APPLICATION_JSON)
                        .content(updateItemBody(2)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CART_ITEM_NOT_FOUND"));
    }

    private String signupToken(String email) throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password1", "장바구니 사용자"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode responseJson = objectMapper.readTree(response);
        return responseJson.get("accessToken").asText();
    }

    private String addItemBody(String productId, int quantity) throws Exception {
        return objectMapper.writeValueAsString(new AddCartItemRequest(productId, quantity));
    }

    private String updateItemBody(int quantity) throws Exception {
        return objectMapper.writeValueAsString(new UpdateCartItemRequest(quantity));
    }
}
