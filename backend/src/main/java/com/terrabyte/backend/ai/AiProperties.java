package com.terrabyte.backend.ai;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Settings for the optional irrigation AI server.
 *
 * <p>Every field has a default and {@code enabled} defaults to {@code false},
 * because the backend has to run in an environment where no AI server exists at
 * all. The AI only ever suggests <em>how much</em> water; it can never trigger
 * irrigation on its own, so losing it degrades the volume estimate rather than
 * the feature.
 *
 * @param enabled               whether to call the AI server at all. When false the
 *                              resolver goes straight to the fallback table and no
 *                              HTTP request is made
 * @param baseUrl               root URL of the AI server, without a trailing path
 * @param apiKey                sent as {@code X-Api-Key} when present. Optional, because
 *                              the demo deployment runs the AI server on a private network
 * @param timeout               connect and read budget for one prediction. Deliberately
 *                              sub-second: irrigation decisions run on a schedule and a
 *                              slow model must not hold the decision loop open
 * @param expectedSchemaVersion the {@code input_schema_version} this backend was built
 *                              against. A mismatch means the deployed model expects
 *                              different features, so its output is meaningless here
 * @param hardCeilingMl         any predicted volume above this is treated as a broken
 *                              model, not as a large-but-valid dose
 * @param minConfidence         below this the prediction is used only if it is more
 *                              conservative than the fallback
 */
@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("http://localhost:8000") String baseUrl,
        String apiKey,
        @DefaultValue("PT0.8S") Duration timeout,
        @DefaultValue("1") int expectedSchemaVersion,
        @DefaultValue("500") int hardCeilingMl,
        @DefaultValue("0.5") double minConfidence) {

    /** True when an API key was configured; used to decide whether to send the header. */
    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
