package com.terrabyte.backend.ai;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class IrrigationAiClientTests {

    private static final String BASE_URL = "http://ai.test:8000";
    private static final String PREDICT_URL = BASE_URL + "/predict/irrigation";

    private static final String OK_BODY = """
            {
              "volume_ml": 130,
              "confidence": 0.91,
              "model_version": "irrigation_rf_v3",
              "input_schema_version": 1,
              "imputed": [],
              "latency_ms": 4.2
            }
            """;

    private MockRestServiceServer server;

    private IrrigationAiClient clientWith(AiProperties properties) {
        RestClient.Builder builder = RestClient.builder().baseUrl(properties.baseUrl());
        this.server = MockRestServiceServer.bindTo(builder).build();
        return new IrrigationAiClient(properties, builder.build());
    }

    private static AiProperties properties(boolean enabled, String apiKey) {
        return new AiProperties(enabled, BASE_URL, apiKey, Duration.ofMillis(800), 1, 500, 0.5);
    }

    private static IrrigationPredictionRequest sample() {
        return new IrrigationPredictionRequest(1, "TOMATO", 2500, 22.4, 21.0, 27.1, 58.0, 230.5, 7.5);
    }

    @Test
    void returnsOkWithTheParsedPredictionOnSuccess() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(OK_BODY, MediaType.APPLICATION_JSON));

        IrrigationAiClient.Result result = client.predictIrrigation(sample());

        assertThat(result.outcome()).isEqualTo(AiOutcome.OK);
        assertThat(result.isUsable()).isTrue();
        assertThat(result.prediction().volumeMl()).isEqualTo(130);
        assertThat(result.prediction().confidence()).isEqualTo(0.91);
        assertThat(result.modelVersion()).isEqualTo("irrigation_rf_v3");
        server.verify();
    }

    @Test
    void sendsFeaturesAsSnakeCase() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.input_schema_version").value(1))
                .andExpect(jsonPath("$.soil_moisture_pct").value(22.4))
                .andExpect(jsonPath("$.substrate_volume_ml").value(2500))
                .andExpect(jsonPath("$.plant_light_ppfd_umol_m2_s").value(230.5))
                .andRespond(withSuccess(OK_BODY, MediaType.APPLICATION_JSON));

        client.predictIrrigation(sample());

        server.verify();
    }

    @Test
    void sendsTheApiKeyHeaderOnlyWhenConfigured() {
        IrrigationAiClient withKey = clientWith(properties(true, "s3cret"));
        server.expect(requestTo(PREDICT_URL))
                .andExpect(header("X-Api-Key", "s3cret"))
                .andRespond(withSuccess(OK_BODY, MediaType.APPLICATION_JSON));
        withKey.predictIrrigation(sample());
        server.verify();

        IrrigationAiClient withoutKey = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andExpect(headerDoesNotExist("X-Api-Key"))
                .andRespond(withSuccess(OK_BODY, MediaType.APPLICATION_JSON));
        withoutKey.predictIrrigation(sample());
        server.verify();
    }

    @Test
    void reportsSchemaMismatchButKeepsTheModelVersion() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andRespond(withSuccess("""
                        {"volume_ml": 130, "confidence": 0.91, "model_version": "irrigation_rf_v9",
                         "input_schema_version": 2, "imputed": [], "latency_ms": 4.2}
                        """, MediaType.APPLICATION_JSON));

        IrrigationAiClient.Result result = client.predictIrrigation(sample());

        assertThat(result.outcome()).isEqualTo(AiOutcome.SCHEMA_MISMATCH);
        assertThat(result.isUsable()).isFalse();
        assertThat(result.modelVersion()).isEqualTo("irrigation_rf_v9");
    }

    @Test
    void mapsModelUnavailableToError() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"code": "MODEL_UNAVAILABLE", "message": "no model loaded"}
                                """));

        IrrigationAiClient.Result result = client.predictIrrigation(sample());

        assertThat(result.outcome()).isEqualTo(AiOutcome.ERROR);
        assertThat(result.prediction()).isNull();
    }

    @Test
    void mapsInvalidFeaturesToError() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"code": "INVALID_FEATURES", "message": "bad", "details": []}
                                """));

        assertThat(client.predictIrrigation(sample()).outcome()).isEqualTo(AiOutcome.ERROR);
    }

    @Test
    void mapsATimeoutToTimeoutAndNeverThrows() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andRespond(withException(new SocketTimeoutException("Read timed out")));

        IrrigationAiClient.Result[] captured = new IrrigationAiClient.Result[1];
        assertThatCode(() -> captured[0] = client.predictIrrigation(sample()))
                .doesNotThrowAnyException();

        assertThat(captured[0].outcome()).isEqualTo(AiOutcome.TIMEOUT);
        assertThat(captured[0].prediction()).isNull();
    }

    @Test
    void mapsANonTimeoutIoFailureToError() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andRespond(withException(new IOException("connection reset")));

        assertThat(client.predictIrrigation(sample()).outcome()).isEqualTo(AiOutcome.ERROR);
    }

    @Test
    void mapsAnUnparseableBodyToError() {
        IrrigationAiClient client = clientWith(properties(true, null));
        server.expect(requestTo(PREDICT_URL))
                .andRespond(withSuccess("not json at all", MediaType.APPLICATION_JSON));

        assertThat(client.predictIrrigation(sample()).outcome()).isEqualTo(AiOutcome.ERROR);
    }

    @Test
    void doesNotRetryAfterAFailure() {
        IrrigationAiClient client = clientWith(properties(true, null));
        // Exactly one expectation: a second attempt would fail verification, which
        // is the point — a retry would silently double the caller's time budget.
        server.expect(requestTo(PREDICT_URL)).andRespond(withServerError());

        assertThat(client.predictIrrigation(sample()).outcome()).isEqualTo(AiOutcome.ERROR);
        server.verify();
    }

    @Test
    void makesNoHttpCallWhenDisabled() {
        IrrigationAiClient client = clientWith(properties(false, "s3cret"));
        // No expectations recorded, so any request at all fails verify().

        IrrigationAiClient.Result result = client.predictIrrigation(sample());

        assertThat(result.outcome()).isEqualTo(AiOutcome.DISABLED);
        assertThat(result.prediction()).isNull();
        server.verify();
    }
}
