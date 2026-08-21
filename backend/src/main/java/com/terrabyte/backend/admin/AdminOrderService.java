package com.terrabyte.backend.admin;

import java.time.Instant;
import java.util.List;

import com.terrabyte.backend.api.ApiException;
import com.terrabyte.backend.order.OrderRepository;
import com.terrabyte.backend.order.OrderStatus;
import com.terrabyte.backend.order.ShopOrder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminOrderService {

    private final OrderRepository orderRepository;

    public AdminOrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)
    public List<AdminOrderSummaryResponse> findAll(String status) {
        OrderStatus parsedStatus = status == null ? null : OrderStatus.valueOf(status);
        return orderRepository.findAllForAdmin(parsedStatus).stream()
                .map(AdminOrderSummaryResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public AdminOrderDetailResponse findOne(long orderId) {
        return detail(requireOrder(orderId));
    }

    @Transactional
    public AdminOrderDetailResponse updateStatus(
            long orderId,
            UpdateAdminOrderStatusRequest request) {
        ShopOrder order = orderRepository.findByIdForAdminForUpdate(orderId)
                .orElseThrow(this::orderNotFound);
        OrderStatus targetStatus = request.status();
        if (order.status() == targetStatus) {
            return detail(order);
        }

        OrderStatus allowedNext = nextStatus(order.status());
        if (targetStatus != allowedNext) {
            throw invalidTransition(order.status(), targetStatus);
        }
        if (orderRepository.updateStatus(orderId, order.status(), targetStatus, Instant.now()) != 1) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "ORDER_STATUS_CONFLICT",
                    "다른 요청에서 주문 상태가 변경되었습니다. 다시 조회해 주세요.");
        }
        return detail(requireOrder(orderId));
    }

    private OrderStatus nextStatus(OrderStatus currentStatus) {
        return switch (currentStatus) {
            case PAID -> OrderStatus.PREPARING;
            case PREPARING -> OrderStatus.SHIPPED;
            case SHIPPED -> OrderStatus.DELIVERED;
            default -> null;
        };
    }

    private ShopOrder requireOrder(long orderId) {
        return orderRepository.findByIdForAdmin(orderId)
                .orElseThrow(this::orderNotFound);
    }

    private AdminOrderDetailResponse detail(ShopOrder order) {
        return AdminOrderDetailResponse.from(order, orderRepository.findItems(order.id()));
    }

    private ApiException orderNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "ORDER_NOT_FOUND",
                "주문을 찾을 수 없습니다.");
    }

    private ApiException invalidTransition(OrderStatus current, OrderStatus target) {
        return new ApiException(
                HttpStatus.CONFLICT,
                "INVALID_ORDER_STATUS_TRANSITION",
                current + " 상태에서 " + target + " 상태로 변경할 수 없습니다.");
    }
}
