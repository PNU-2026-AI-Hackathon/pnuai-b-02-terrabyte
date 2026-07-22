package com.terrabyte.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Objects;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class GlobalExceptionHandlerTests {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void formatsDomainErrorsUsingTheCommonContract() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/example");
        ApiException exception = new ApiException(
                HttpStatus.NOT_FOUND,
                "EXAMPLE_NOT_FOUND",
                "대상을 찾을 수 없습니다.");

        ResponseEntity<ApiError> response = handler.handleApiException(exception, request);
        ApiError body = Objects.requireNonNull(response.getBody());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(body.status()).isEqualTo(404);
        assertThat(body.code()).isEqualTo("EXAMPLE_NOT_FOUND");
        assertThat(body.path()).isEqualTo("/api/example");
        assertThat(body.fieldErrors()).isEmpty();
    }
}
