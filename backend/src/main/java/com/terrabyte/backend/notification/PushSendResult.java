package com.terrabyte.backend.notification;

public record PushSendResult(Status status, String detail) {

    public enum Status {
        SENT,
        INVALID_TOKEN,
        FAILED,
        SKIPPED
    }

    public static PushSendResult sent(String detail) {
        return new PushSendResult(Status.SENT, detail);
    }

    public static PushSendResult invalidToken(String detail) {
        return new PushSendResult(Status.INVALID_TOKEN, detail);
    }

    public static PushSendResult failed(String detail) {
        return new PushSendResult(Status.FAILED, detail);
    }

    public static PushSendResult skipped(String detail) {
        return new PushSendResult(Status.SKIPPED, detail);
    }
}
