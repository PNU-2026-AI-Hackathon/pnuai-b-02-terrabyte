package com.terrabyte.backend.order;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderDetailResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateOrderRequest request) {
        return orderService.create(userId(jwt), request);
    }

    @GetMapping
    public List<OrderSummaryResponse> findAll(@AuthenticationPrincipal Jwt jwt) {
        return orderService.findAll(userId(jwt));
    }

    @GetMapping("/{orderId}")
    public OrderDetailResponse findOne(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable @Positive(message = "주문 ID는 양수여야 합니다.") long orderId) {
        return orderService.findOne(userId(jwt), orderId);
    }

    @PostMapping("/{orderId}/cancel")
    public OrderDetailResponse cancel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable @Positive(message = "주문 ID는 양수여야 합니다.") long orderId) {
        return orderService.cancel(userId(jwt), orderId);
    }

    private long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
