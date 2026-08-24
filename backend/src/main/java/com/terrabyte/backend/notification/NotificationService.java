package com.terrabyte.backend.notification;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

import com.terrabyte.backend.api.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationService.class);

    private final PushRegistrationRepository registrationRepository;
    private final NotificationEventRepository eventRepository;
    private final NotificationRecordService recordService;
    private final PushSender pushSender;
    private final Clock clock;

    public NotificationService(
            PushRegistrationRepository registrationRepository,
            NotificationEventRepository eventRepository,
            NotificationRecordService recordService,
            PushSender pushSender,
            Clock clock) {
        this.registrationRepository = registrationRepository;
        this.eventRepository = eventRepository;
        this.recordService = recordService;
        this.pushSender = pushSender;
        this.clock = clock;
    }

    @Transactional
    public PushRegistrationResponse register(
            long userId, RegisterPushTokenRequest request) {
        return PushRegistrationResponse.from(registrationRepository.register(
                userId, request.token().trim(), request.platform(), clock.instant()));
    }

    @Transactional
    public void unregister(long userId, UnregisterPushTokenRequest request) {
        registrationRepository.deactivate(userId, request.token().trim(), clock.instant());
    }

    public List<NotificationResponse> findAll(long userId, int limit) {
        return eventRepository.findAllForUser(userId, limit).stream()
                .map(NotificationResponse::from)
                .toList();
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

    public void handleCondition(
            NotificationRequest request,
            boolean active,
            Duration reminderInterval) {
        recordService.recordCondition(request, active, reminderInterval)
                .ifPresent(this::dispatch);
    }

    public void handleOnce(NotificationRequest request) {
        recordService.recordOnce(request).ifPresent(this::dispatch);
    }

    private void dispatch(NotificationEvent event) {
        PushMessage message = new PushMessage(event.title(), event.body(), pushData(event));
        for (PushRegistration registration
                : registrationRepository.findActiveByUser(event.userId())) {
            PushSendResult result = pushSender.send(registration.token(), message);
            if (result.status() == PushSendResult.Status.INVALID_TOKEN) {
                registrationRepository.deactivateToken(registration.token(), clock.instant());
            } else if (result.status() == PushSendResult.Status.FAILED) {
                LOGGER.warn(
                        "push delivery failed notification_id={} registration_id={} detail={}",
                        event.id(), registration.id(), result.detail());
            }
        }
    }

    private java.util.Map<String, String> pushData(NotificationEvent event) {
        java.util.Map<String, String> data = new java.util.HashMap<>(event.data());
        data.put("notificationId", Long.toString(event.id()));
        data.put("type", event.type().name());
        if (event.deviceId() != null) data.put("deviceId", event.deviceId().toString());
        if (event.potId() != null) data.put("potId", event.potId().toString());
        return data;
    }
}
