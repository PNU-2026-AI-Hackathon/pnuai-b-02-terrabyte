package com.terrabyte.backend.notification;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationRecordService {

    private final NotificationConditionRepository conditionRepository;
    private final NotificationEventRepository eventRepository;
    private final Clock clock;

    public NotificationRecordService(
            NotificationConditionRepository conditionRepository,
            NotificationEventRepository eventRepository,
            Clock clock) {
        this.conditionRepository = conditionRepository;
        this.eventRepository = eventRepository;
        this.clock = clock;
    }

    @Transactional
    public Optional<NotificationEvent> recordCondition(
            NotificationRequest request,
            boolean active,
            Duration reminderInterval) {
        Instant now = clock.instant();
        if (!active) {
            conditionRepository.resolve(request.userId(), request.dedupeKey(), now);
            return Optional.empty();
        }

        Optional<NotificationConditionRepository.State> existing =
                conditionRepository.find(request.userId(), request.dedupeKey());
        if (existing.isEmpty()) {
            if (conditionRepository.insertActiveIfAbsent(
                    request.userId(), request.dedupeKey(), now) == 1) {
                return Optional.of(eventRepository.save(request, now));
            }
            existing = conditionRepository.find(request.userId(), request.dedupeKey());
        }

        NotificationConditionRepository.State state = existing.orElseThrow();
        boolean shouldNotify = !state.active()
                || state.lastNotifiedAt() == null
                || !state.lastNotifiedAt().plus(reminderInterval).isAfter(now);
        conditionRepository.markActive(
                request.userId(), request.dedupeKey(), now, shouldNotify);
        return shouldNotify ? Optional.of(eventRepository.save(request, now)) : Optional.empty();
    }

    @Transactional
    public Optional<NotificationEvent> recordOnce(NotificationRequest request) {
        if (request.externalRef() == null || request.externalRef().isBlank()) {
            throw new IllegalArgumentException("A one-time notification requires an external reference");
        }
        return eventRepository.saveOnce(request, clock.instant());
    }
}
