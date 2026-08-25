package com.terrabyte.backend.notification;

public interface PushSender {
    PushSendResult send(String token, PushMessage message);
}
