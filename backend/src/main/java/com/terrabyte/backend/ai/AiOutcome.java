package com.terrabyte.backend.ai;

/**
 * How one attempt to get a volume from the AI server ended.
 *
 * <p><strong>These constant names are exported as the {@code outcome} tag of the
 * {@code ai_predict_latency_seconds} metric and are written to the decision
 * audit trail. Renaming one silently breaks existing dashboards and makes old
 * rows unjoinable with new ones — treat them as a published contract.</strong>
 *
 * <p>Every value except {@link #OK} means the fallback table was used, so an
 * operator can answer "did the model actually decide this?" from the tag alone.
 */
public enum AiOutcome {
    /** The server answered in time, with a matching schema and a usable volume. */
    OK,
    /** The call exceeded its budget. Distinguished from ERROR because it points at the model, not the wiring. */
    TIMEOUT,
    /** Transport failure, non-2xx status, or an unparseable body. Includes the server's own 503 MODEL_UNAVAILABLE. */
    ERROR,
    /** The server's {@code input_schema_version} is not the one this backend builds features for. */
    SCHEMA_MISMATCH,
    /** The predicted volume fell outside {@code [0, hardCeilingMl]}, so it was discarded rather than clamped. */
    OUT_OF_RANGE,
    /** {@code app.ai.enabled} is false. No HTTP request was attempted. */
    DISABLED
}
