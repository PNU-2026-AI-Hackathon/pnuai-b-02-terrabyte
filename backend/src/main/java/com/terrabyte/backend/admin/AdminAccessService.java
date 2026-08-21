package com.terrabyte.backend.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import com.terrabyte.backend.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class AdminAccessService {

    private final AdminProperties properties;

    public AdminAccessService(AdminProperties properties) {
        this.properties = properties;
    }

    public void requireAccess(String providedApiKey) {
        if (!properties.configured()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "ADMIN_API_NOT_CONFIGURED",
                    "관리자 API 키가 설정되지 않았습니다.");
        }
        if (providedApiKey == null || !MessageDigest.isEqual(
                properties.apiKey().getBytes(StandardCharsets.UTF_8),
                providedApiKey.getBytes(StandardCharsets.UTF_8))) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "ADMIN_ACCESS_DENIED",
                    "관리자 API 키가 올바르지 않습니다.");
        }
    }
}
