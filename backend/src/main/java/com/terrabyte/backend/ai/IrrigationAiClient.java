package com.terrabyte.backend.ai;

import java.net.SocketTimeoutException;
import java.net.http.HttpConnectTimeoutException;
import java.util.concurrent.TimeoutException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * Calls the irrigation AI server, and never lets it break the caller.
 *
 * <p>Two rules shape this class:
 *
 * <ol>
 *   <li><strong>No exception ever leaves {@link #predictIrrigation}.</strong> The AI
 *       is advisory — it suggests how much water, it does not decide whether to
 *       water. Letting an AI outage propagate would turn an optional dependency
 *       into a backend outage, which is exactly backwards from its importance.
 *   <li><strong>No retry.</strong> The caller sized its budget around one
 *       {@code app.ai.timeout}; a transparent retry would silently double it.
 *       A prediction that is late is worth nothing anyway — the fallback table
 *       is already a correct answer, just a less precise one.
 * </ol>
 *
 * <p>{@code @EnableConfigurationProperties} sits here rather than on a separate
 * configuration class because {@link AiProperties} has exactly one consumer and
 * this application does not use {@code @ConfigurationPropertiesScan}.
 */
@Component
public class IrrigationAiClient {

    private static final Logger log = LoggerFactory.getLogger(IrrigationAiClient.class);

    private static final String PREDICT_PATH = "/predict/irrigation";
    private static final String API_KEY_HEADER = "X-Api-Key";

    private final AiProperties properties;
    private final RestClient restClient;

    // Explicit, because the test-seam constructor below makes the choice ambiguous.
    @Autowired
    public IrrigationAiClient(AiProperties properties, RestClient.Builder builder) {
        this(properties, builder
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory(properties))
                .build());
    }

    /** Test seam: lets a test supply a {@link RestClient} bound to a mock server. */
    IrrigationAiClient(AiProperties properties, RestClient restClient) {
        this.properties = properties;
        this.restClient = restClient;
    }

    /**
     * Asks the AI server for a dose.
     *
     * @return always non-null. Check {@link Result#outcome()} before reading the
     *         prediction; only {@link AiOutcome#OK} and
     *         {@link AiOutcome#SCHEMA_MISMATCH} carry a body
     */
    public Result predictIrrigation(IrrigationPredictionRequest request) {
        if (!properties.enabled()) {
            // Short-circuit before any network work so an unconfigured deployment
            // pays nothing at all for the AI path.
            return Result.without(AiOutcome.DISABLED);
        }
        try {
            IrrigationPredictionResponse response = restClient.post()
                    .uri(PREDICT_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .headers(headers -> {
                        if (properties.hasApiKey()) {
                            headers.set(API_KEY_HEADER, properties.apiKey());
                        }
                    })
                    .body(request)
                    .retrieve()
                    .body(IrrigationPredictionResponse.class);

            if (response == null) {
                log.warn("AI prediction returned an empty body");
                return Result.without(AiOutcome.ERROR);
            }
            if (response.inputSchemaVersion() != properties.expectedSchemaVersion()) {
                // Carry the body through anyway: the model version is still worth
                // recording, because it names the artifact that has to be rolled back.
                log.warn("AI schema mismatch: expected {}, server sent {} (model {})",
                        properties.expectedSchemaVersion(),
                        response.inputSchemaVersion(),
                        response.modelVersion());
                return new Result(AiOutcome.SCHEMA_MISMATCH, response);
            }
            return new Result(AiOutcome.OK, response);
        } catch (ResourceAccessException e) {
            AiOutcome outcome = isTimeout(e) ? AiOutcome.TIMEOUT : AiOutcome.ERROR;
            // Message only. The exception carries the request URI, and the API key
            // lives in a header we never log or echo.
            log.warn("AI prediction {}: {}", outcome, e.getMessage());
            return Result.without(outcome);
        } catch (Exception e) {
            // Deliberately broad: non-2xx, malformed JSON, DNS failure and anything
            // else all mean the same thing to the caller — use the fallback.
            log.warn("AI prediction failed: {}", e.getMessage());
            return Result.without(AiOutcome.ERROR);
        }
    }

    /**
     * One prediction attempt.
     *
     * @param outcome    never null
     * @param prediction null unless the server actually returned a parseable body
     */
    public record Result(AiOutcome outcome, IrrigationPredictionResponse prediction) {

        static Result without(AiOutcome outcome) {
            return new Result(outcome, null);
        }

        public boolean isUsable() {
            return outcome == AiOutcome.OK && prediction != null;
        }

        /** The model that produced this, or null when no body came back. */
        public String modelVersion() {
            return prediction == null ? null : prediction.modelVersion();
        }
    }

    private static SimpleClientHttpRequestFactory requestFactory(AiProperties properties) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        // Both halves get the full budget: a connect that hangs is as bad as a
        // slow model, and the caller only cares about the total wall clock.
        factory.setConnectTimeout((int) properties.timeout().toMillis());
        factory.setReadTimeout((int) properties.timeout().toMillis());
        return factory;
    }

    private static boolean isTimeout(Throwable e) {
        for (Throwable cause = e; cause != null; cause = cause.getCause()) {
            if (cause instanceof SocketTimeoutException
                    || cause instanceof HttpConnectTimeoutException
                    || cause instanceof TimeoutException) {
                return true;
            }
            if (cause.getCause() == cause) {
                break;
            }
        }
        return false;
    }
}
