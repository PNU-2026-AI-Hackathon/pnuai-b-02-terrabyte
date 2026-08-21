package com.terrabyte.backend.shop;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ShopProductApiIntegrationTests {

    private final MockMvc mockMvc;

    @Autowired
    ShopProductApiIntegrationTests(MockMvc mockMvc) {
        this.mockMvc = mockMvc;
    }

    @Test
    void returnsPublicProductCatalogInDisplayOrder() throws Exception {
        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(22))
                .andExpect(jsonPath("$[0].id").value("grow-light"))
                .andExpect(jsonPath("$[0].desc").value("실내 재배 공간에 설치하기 좋은 바 타입 조명"))
                .andExpect(jsonPath("$[0].price").value(29900))
                .andExpect(jsonPath("$[0].discountRate").value(10))
                .andExpect(jsonPath("$[0].salePrice").value(26910))
                .andExpect(jsonPath("$[0].discounted").value(true))
                .andExpect(jsonPath("$[0].packageQuantity").value(1))
                .andExpect(jsonPath("$[0].packageUnit").value("개"))
                .andExpect(jsonPath("$[0].subCategory").doesNotExist())
                .andExpect(jsonPath("$[0].available").value(true))
                .andExpect(jsonPath("$[21].id").value("cherry-tomato-seeds"));
    }

    @Test
    void filtersCatalogByCategorySearchAndRecommendation() throws Exception {
        mockMvc.perform(get("/api/products").queryParam("category", "seeds"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7))
                .andExpect(jsonPath("$[0].id").value("basil-seeds"));

        mockMvc.perform(get("/api/products").queryParam("q", "관수"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].id").value("watering-kit"))
                .andExpect(jsonPath("$[1].id").value("power-adapter"))
                .andExpect(jsonPath("$[2].id").value("outlet-timer"))
                .andExpect(jsonPath("$[3].id").value("self-watering-pot"));

        mockMvc.perform(get("/api/products")
                        .queryParam("category", "soil")
                        .queryParam("subCategory", "MEDIA"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].id").value("perlite"))
                .andExpect(jsonPath("$[0].subCategory").value("MEDIA"));

        mockMvc.perform(get("/api/products")
                        .queryParam("category", "soil")
                        .queryParam("subCategory", "NUTRIENT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value("liquid-nutrient"));

        mockMvc.perform(get("/api/products").queryParam("recommended", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(6))
                .andExpect(jsonPath("$[0].badge").value("추천"));
    }

    @Test
    void returnsProductDetailAndNotFoundError() throws Exception {
        mockMvc.perform(get("/api/products/{productId}", "soil-meter"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("토양 pH·수분 측정기"))
                .andExpect(jsonPath("$.packageQuantity").value(1))
                .andExpect(jsonPath("$.packageUnit").value("개"))
                .andExpect(jsonPath("$.discountRate").value(10))
                .andExpect(jsonPath("$.salePrice").value(19710))
                .andExpect(jsonPath("$.stockQuantity").value(20))
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        mockMvc.perform(get("/api/products/{productId}", "unknown-product"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PRODUCT_NOT_FOUND"));
    }

    @Test
    void validatesCatalogFilters() throws Exception {
        mockMvc.perform(get("/api/products").queryParam("category", "tools"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        mockMvc.perform(get("/api/products").queryParam("subCategory", "TOOLS"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
