package com.terrabyte.backend.notification;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class NotificationDomainListener {

    private static final DateTimeFormatter KOREAN_TIME = DateTimeFormatter
            .ofPattern("M월 d일 HH:mm")
            .withZone(ZoneId.of("Asia/Seoul"));

    private final NotificationService notificationService;
    private final NotificationProperties properties;

    public NotificationDomainListener(
            NotificationService notificationService,
            NotificationProperties properties) {
        this.notificationService = notificationService;
        this.properties = properties;
    }

    @TransactionalEventListener(
            phase = TransactionPhase.BEFORE_COMMIT,
            fallbackExecution = true)
    public void sensorQualityObserved(SensorQualityObservedEvent event) {
        sensorCondition(event, "air", "온·습도 센서", event.airSensorValid());
        sensorCondition(event, "light", "조도 센서", event.lightSensorValid());
        // null means this node has no optional soil probe. It is not a fault.
        if (event.soilSensorValid() != null) {
            sensorCondition(event, "soil", "토양 센서", event.soilSensorValid());
        }
    }

    @TransactionalEventListener(
            phase = TransactionPhase.BEFORE_COMMIT,
            fallbackExecution = true)
    public void devicePresenceObserved(DevicePresenceObservedEvent event) {
        String conditionKey = "device-offline:" + event.deviceId();
        String lastSeen = event.lastSeenAt() == null
                ? "최근 수신 시각을 확인할 수 없습니다."
                : "마지막 수신은 " + KOREAN_TIME.format(event.lastSeenAt()) + "입니다.";
        NotificationRequest request = new NotificationRequest(
                event.userId(),
                NotificationType.DEVICE_OFFLINE,
                "기기 연결이 끊겼습니다",
                "등록 기기 " + event.serialCode() + "이 오프라인입니다. " + lastSeen,
                event.deviceId(),
                null,
                null,
                conditionKey,
                Map.of("serialCode", event.serialCode()));
        notificationService.handleCondition(
                request, !event.online(), properties.offlineReminderInterval());
    }

    @TransactionalEventListener(
            phase = TransactionPhase.BEFORE_COMMIT,
            fallbackExecution = true)
    public void irrigationCompleted(IrrigationCompletedEvent event) {
        Map<String, String> data = new HashMap<>();
        data.put("commandId", event.commandId());
        data.put("completedAt", event.completedAt().toString());
        if (event.actualMilliliters() != null) {
            data.put("actualMilliliters", event.actualMilliliters().stripTrailingZeros().toPlainString());
        }
        String volume = event.actualMilliliters() == null
                ? ""
                : " (" + event.actualMilliliters().stripTrailingZeros().toPlainString() + "mL)";
        notificationService.handleOnce(new NotificationRequest(
                event.userId(),
                NotificationType.IRRIGATION_COMPLETED,
                event.potLabel() + " 관수가 완료되었습니다",
                KOREAN_TIME.format(event.completedAt()) + "에 관수를 완료했습니다" + volume + ".",
                event.deviceId(),
                event.potId(),
                event.commandId(),
                "irrigation-completed:" + event.commandId(),
                data));
    }

    private void sensorCondition(
            SensorQualityObservedEvent event,
            String sensorKey,
            String sensorLabel,
            boolean valid) {
        String conditionKey = "sensor-invalid:" + event.potId() + ":" + sensorKey;
        NotificationRequest request = new NotificationRequest(
                event.userId(),
                NotificationType.SENSOR_ANOMALY,
                event.potLabel() + "의 " + sensorLabel + "를 확인해 주세요",
                sensorLabel + "가 유효하지 않은 값을 보고했습니다. 마지막 측정: "
                        + KOREAN_TIME.format(event.observedAt()),
                event.deviceId(),
                event.potId(),
                null,
                conditionKey,
                Map.of("sensorKey", sensorKey, "sensorLabel", sensorLabel));
        notificationService.handleCondition(
                request, !valid, properties.sensorReminderInterval());
    }
}
