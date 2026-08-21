package com.terrabyte.backend.admin;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/admin/orders")
public class AdminOrderController {

    private final AdminAccessService accessService;
    private final AdminOrderService orderService;

    public AdminOrderController(
            AdminAccessService accessService,
            AdminOrderService orderService) {
        this.accessService = accessService;
        this.orderService = orderService;
    }

    @GetMapping
    public List<AdminOrderSummaryResponse> findAll(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
            @RequestParam(required = false)
            @Pattern(
                    regexp = "PENDING|PAID|PREPARING|SHIPPED|DELIVERED|CANCELLED",
                    message = "주문 상태가 올바르지 않습니다.")
            String status) {
        accessService.requireAccess(adminApiKey);
        return orderService.findAll(status);
    }

    @GetMapping("/{orderId}")
    public AdminOrderDetailResponse findOne(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
            @PathVariable @Positive(message = "주문 ID는 양수여야 합니다.") long orderId) {
        accessService.requireAccess(adminApiKey);
        return orderService.findOne(orderId);
    }

    @PatchMapping("/{orderId}/status")
    public AdminOrderDetailResponse updateStatus(
            @RequestHeader(name = "X-Admin-Key", required = false) String adminApiKey,
            @PathVariable @Positive(message = "주문 ID는 양수여야 합니다.") long orderId,
            @Valid @RequestBody UpdateAdminOrderStatusRequest request) {
        accessService.requireAccess(adminApiKey);
        return orderService.updateStatus(orderId, request);
    }
}
