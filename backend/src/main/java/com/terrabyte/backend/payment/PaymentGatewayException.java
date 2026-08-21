package com.terrabyte.backend.payment;

public class PaymentGatewayException extends RuntimeException {

    private final String code;
    private final boolean definitive;

    public PaymentGatewayException(String code, String message, boolean definitive, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.definitive = definitive;
    }

    public String code() {
        return code;
    }

    public boolean definitive() {
        return definitive;
    }
}
