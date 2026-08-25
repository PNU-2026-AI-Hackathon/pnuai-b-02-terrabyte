package com.terrabyte.backend.notification;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Validated
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostMapping("/push-tokens")
    public ResponseEntity<PushRegistrationResponse> register(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody RegisterPushTokenRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(notificationService.register(userId(jwt), request));
    }

    @DeleteMapping("/push-tokens")
    public ResponseEntity<Void> unregister(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UnregisterPushTokenRequest request) {
        notificationService.unregister(userId(jwt), request);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/push-tokens/all")
    public ResponseEntity<Void> unregisterAll(@AuthenticationPrincipal Jwt jwt) {
        notificationService.unregisterAll(userId(jwt));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/notifications")
    public List<NotificationResponse> notifications(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit) {
        return notificationService.findAll(userId(jwt), limit);
    }

    @GetMapping("/notifications/unread-count")
    public UnreadNotificationCountResponse unreadCount(@AuthenticationPrincipal Jwt jwt) {
        return notificationService.unreadCount(userId(jwt));
    }

    @PatchMapping("/notifications/{notificationId}/read")
    public ResponseEntity<Void> markRead(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long notificationId) {
        notificationService.markRead(userId(jwt), notificationId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/notifications/read-all")
    public ResponseEntity<Void> markAllRead(@AuthenticationPrincipal Jwt jwt) {
        notificationService.markAllRead(userId(jwt));
        return ResponseEntity.noContent().build();
    }

    private long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
