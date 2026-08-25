package com.terrabyte.backend.notification;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class NotificationDeliveryWorker {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationDeliveryWorker.class);

    private final NotificationDeliveryRepository deliveryRepository;
    private final NotificationEventRepository eventRepository;
    private final PushRegistrationRepository registrationRepository;
    private final PushSender pushSender;
    private final NotificationProperties properties;
    private final Clock clock;

    public NotificationDeliveryWorker(
            NotificationDeliveryRepository deliveryRepository,
            NotificationEventRepository eventRepository,
            PushRegistrationRepository registrationRepository,
            PushSender pushSender,
            NotificationProperties properties,
            Clock clock) {
        this.deliveryRepository = deliveryRepository;
        this.eventRepository = eventRepository;
        this.registrationRepository = registrationRepository;
        this.pushSender = pushSender;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.notification.delivery.poll-delay-ms:5000}")
    public void scheduledDrain() {
        drainOnce();
    }

    public int drainOnce() {
        NotificationProperties.Delivery settings = properties.delivery();
        Instant now = clock.instant();
        deliveryRepository.recoverStaleClaims(now.minus(settings.claimTimeout()), now);
        int processed = 0;
        for (Long id : deliveryRepository.findPendingIds(now, settings.batchSize())) {
            if (deliveryRepository.claim(id, now).map(this::deliver).orElse(false)) {
                processed++;
            }
        }
        return processed;
    }

    private boolean deliver(NotificationDelivery delivery) {
        Instant now = clock.instant();
        NotificationEvent event = eventRepository.findById(delivery.notificationId())
                .orElse(null);
        PushRegistration registration = registrationRepository
                .findById(delivery.registrationId())
                .orElse(null);
        if (event == null || registration == null || !registration.active()
                || registration.userId() != event.userId()) {
            deliveryRepository.markSkipped(delivery.id(), "registration_inactive", now);
            return true;
        }

        PushMessage message = new PushMessage(event.title(), event.body(), pushData(event));
        PushSendResult result;
        try {
            result = pushSender.send(registration.token(), message);
        } catch (RuntimeException exception) {
            result = PushSendResult.failed(exception.getMessage());
        }

        switch (result.status()) {
            case SENT -> deliveryRepository.markSent(delivery.id(), now);
            case SKIPPED -> deliveryRepository.markSkipped(delivery.id(), result.detail(), now);
            case INVALID_TOKEN -> {
                registrationRepository.deactivateToken(registration.token(), now);
                deliveryRepository.markSkipped(delivery.id(), result.detail(), now);
            }
            case FAILED -> retryOrFail(delivery, result.detail(), now);
        }
        return true;
    }

    private void retryOrFail(NotificationDelivery delivery, String detail, Instant now) {
        int attempts = delivery.attempts() + 1;
        NotificationProperties.Delivery settings = properties.delivery();
        if (attempts >= settings.maxAttempts()) {
            deliveryRepository.markFailed(delivery.id(), attempts, detail, now);
            LOGGER.warn("push delivery exhausted notification_delivery_id={} attempts={} detail={}",
                    delivery.id(), attempts, detail);
            return;
        }
        long multiplier = 1L << Math.min(attempts - 1, 6);
        Duration delay = settings.retryInterval().multipliedBy(multiplier);
        deliveryRepository.retry(delivery.id(), attempts, now.plus(delay), detail, now);
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
