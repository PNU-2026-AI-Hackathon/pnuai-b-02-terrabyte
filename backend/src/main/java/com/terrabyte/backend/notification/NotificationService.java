package com.terrabyte.backend.notification;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import com.terrabyte.backend.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {

    private final PushRegistrationRepository registrationRepository;
    private final NotificationEventRepository eventRepository;
    private final NotificationRecordService recordService;
    private final NotificationDeliveryRepository deliveryRepository;
    private final Clock clock;

    public NotificationService(
            PushRegistrationRepository registrationRepository,
            NotificationEventRepository eventRepository,
            NotificationRecordService recordService,
            NotificationDeliveryRepository deliveryRepository,
            Clock clock) {
        this.registrationRepository = registrationRepository;
        this.eventRepository = eventRepository;
        this.recordService = recordService;
        this.deliveryRepository = deliveryRepository;
        this.clock = clock;
    }

    @Transactional
    public PushRegistrationResponse register(
            long userId, RegisterPushTokenRequest request) {
        Instant now = clock.instant();
        String token = request.token().trim();
        PushRegistration registration = registrationRepository.register(
                userId, token, request.platform(), now);
        if (request.previousToken() != null && !request.previousToken().isBlank()) {
            registrationRepository.deactivatePrevious(
                    userId, request.previousToken().trim(), token, now);
        }
        return PushRegistrationResponse.from(registration);
    }

    @Transactional
    public void unregister(long userId, UnregisterPushTokenRequest request) {
        registrationRepository.deactivate(userId, request.token().trim(), clock.instant());
    }

    @Transactional
    public void unregisterAll(long userId) {
        registrationRepository.deactivateAll(userId, clock.instant());
    }

    public List<NotificationResponse> findAll(long userId, int limit) {
        return eventRepository.findAllForUser(userId, limit).stream()
                .map(NotificationResponse::from)
                .toList();
    }

    public UnreadNotificationCountResponse unreadCount(long userId) {
        return new UnreadNotificationCountResponse(eventRepository.countUnreadForUser(userId));
    }

    @Transactional
    public void markRead(long userId, long notificationId) {
        if (eventRepository.markRead(userId, notificationId, clock.instant()) == 0
                && !eventRepository.existsForUser(userId, notificationId)) {
            throw new ApiException(
                    HttpStatus.NOT_FOUND,
                    "NOTIFICATION_NOT_FOUND",
                    "알림을 찾을 수 없습니다.");
        }
    }

    @Transactional
    public void markAllRead(long userId) {
        eventRepository.markAllRead(userId, clock.instant());
    }

    @Transactional
    public void handleCondition(
            NotificationRequest request,
            boolean active,
            Duration reminderInterval) {
        recordService.recordCondition(request, active, reminderInterval)
                .ifPresent(this::enqueue);
    }

    @Transactional
    public void handleOnce(NotificationRequest request) {
        recordService.recordOnce(request).ifPresent(this::enqueue);
    }

    private void enqueue(NotificationEvent event) {
        deliveryRepository.enqueue(event.id(), event.userId(), clock.instant());
    }
}
