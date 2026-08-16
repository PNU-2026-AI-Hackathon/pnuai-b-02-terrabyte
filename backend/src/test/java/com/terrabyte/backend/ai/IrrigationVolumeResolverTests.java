package com.terrabyte.backend.ai;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class IrrigationVolumeResolverTests {

    private static final int SMALL_POT_ML = 2500;   // fallback band = 80 mL
    private static final int FALLBACK_FOR_SMALL_POT = 80;

    private final IrrigationAiClient aiClient = mock(IrrigationAiClient.class);
    private final AiProperties properties = properties(true);
    private final IrrigationVolumeResolver resolver = new IrrigationVolumeResolver(aiClient, properties);

    private static AiProperties properties(boolean enabled) {
        return new AiProperties(enabled, "http://ai.test:8000", null, Duration.ofMillis(800), 1, 500, 0.5);
    }

    private static IrrigationPredictionRequest features() {
        return new IrrigationPredictionRequest(1, "TOMATO", SMALL_POT_ML, 22.4, 21.0, 27.1, 58.0, 230.5, 7.5);
    }

    private static IrrigationPredictionResponse prediction(int volumeMl, double confidence) {
        return new IrrigationPredictionResponse(
                volumeMl, confidence, "irrigation_rf_v3", 1, List.of(), 4.2);
    }

    private void stub(AiOutcome outcome, IrrigationPredictionResponse prediction) {
        when(aiClient.predictIrrigation(any()))
                .thenReturn(new IrrigationAiClient.Result(outcome, prediction));
    }

    // --- fallback table ---------------------------------------------------

    @Test
    void fallbackTableCoversEveryBand() {
        assertThat(IrrigationVolumeResolver.fallbackVolume(500)).isEqualTo(40);
        assertThat(IrrigationVolumeResolver.fallbackVolume(1000)).isEqualTo(40);
        assertThat(IrrigationVolumeResolver.fallbackVolume(1001)).isEqualTo(80);
        assertThat(IrrigationVolumeResolver.fallbackVolume(3000)).isEqualTo(80);
        assertThat(IrrigationVolumeResolver.fallbackVolume(3001)).isEqualTo(120);
        assertThat(IrrigationVolumeResolver.fallbackVolume(6000)).isEqualTo(120);
        assertThat(IrrigationVolumeResolver.fallbackVolume(6001)).isEqualTo(160);
        assertThat(IrrigationVolumeResolver.fallbackVolume(20000)).isEqualTo(160);
    }

    @Test
    void unknownPotVolumeGetsTheSmallestDose() {
        // Guessing high is the mistake that floods a pot.
        assertThat(IrrigationVolumeResolver.fallbackVolume(null)).isEqualTo(40);
        assertThat(IrrigationVolumeResolver.fallbackVolume(0)).isEqualTo(40);
        assertThat(IrrigationVolumeResolver.fallbackVolume(-1)).isEqualTo(40);
    }

    @Test
    void fallsBackToFortyMillilitresForAnUnknownPotWhenTheAiIsDown() {
        stub(AiOutcome.ERROR, null);

        var resolved = resolver.resolveVolume(null, features());

        assertThat(resolved.volumeMl()).isEqualTo(40);
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.ERROR);
    }

    // --- happy path -------------------------------------------------------

    @Test
    void usesTheAiVolumeAndModelVersionOnTheHappyPath() {
        stub(AiOutcome.OK, prediction(130, 0.91));

        var resolved = resolver.resolveVolume(SMALL_POT_ML, features());

        assertThat(resolved.volumeMl()).isEqualTo(130);
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.OK);
        assertThat(resolved.modelVersion()).isEqualTo("irrigation_rf_v3");
        assertThat(resolved.fromModel()).isTrue();
    }

    // --- rejection paths --------------------------------------------------

    @Test
    void schemaMismatchFallsBackButStillRecordsTheModelVersion() {
        stub(AiOutcome.SCHEMA_MISMATCH, prediction(130, 0.91));

        var resolved = resolver.resolveVolume(SMALL_POT_ML, features());

        assertThat(resolved.volumeMl()).isEqualTo(FALLBACK_FOR_SMALL_POT);
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.SCHEMA_MISMATCH);
        // Still recorded: it names the artifact that has to be rolled back.
        assertThat(resolved.modelVersion()).isEqualTo("irrigation_rf_v3");
    }

    @Test
    void absurdlyLargeVolumeFallsBackAndIsNotClampedToTheCeiling() {
        stub(AiOutcome.OK, prediction(99999, 0.99));

        var resolved = resolver.resolveVolume(SMALL_POT_ML, features());

        assertThat(resolved.volumeMl()).isEqualTo(FALLBACK_FOR_SMALL_POT);
        // The whole point: clamping to 500 would ship a plausible number from a
        // broken model and hide the fault.
        assertThat(resolved.volumeMl()).isNotEqualTo(properties.hardCeilingMl());
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.OUT_OF_RANGE);
    }

    @Test
    void volumeExactlyAtTheCeilingIsStillAccepted() {
        stub(AiOutcome.OK, prediction(500, 0.99));

        assertThat(resolver.resolveVolume(SMALL_POT_ML, features()).volumeMl()).isEqualTo(500);
    }

    @Test
    void negativeVolumeFallsBack() {
        stub(AiOutcome.OK, prediction(-5, 0.99));

        var resolved = resolver.resolveVolume(SMALL_POT_ML, features());

        assertThat(resolved.volumeMl()).isEqualTo(FALLBACK_FOR_SMALL_POT);
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.OUT_OF_RANGE);
    }

    @Test
    void modelUnavailableFallsBack() {
        stub(AiOutcome.ERROR, null);

        var resolved = resolver.resolveVolume(SMALL_POT_ML, features());

        assertThat(resolved.volumeMl()).isEqualTo(FALLBACK_FOR_SMALL_POT);
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.ERROR);
        assertThat(resolved.modelVersion()).isNull();
    }

    @Test
    void timeoutFallsBackWithoutAnExceptionEscaping() {
        stub(AiOutcome.TIMEOUT, null);

        IrrigationVolumeResolver.ResolvedVolume[] captured = new IrrigationVolumeResolver.ResolvedVolume[1];
        assertThatCode(() -> captured[0] = resolver.resolveVolume(SMALL_POT_ML, features()))
                .doesNotThrowAnyException();

        assertThat(captured[0].volumeMl()).isEqualTo(FALLBACK_FOR_SMALL_POT);
        assertThat(captured[0].outcome()).isEqualTo(AiOutcome.TIMEOUT);
    }

    @Test
    void anUnexpectedClientFailureStillYieldsAUsableVolume() {
        when(aiClient.predictIrrigation(any())).thenThrow(new IllegalStateException("boom"));

        var resolved = resolver.resolveVolume(SMALL_POT_ML, features());

        assertThat(resolved.volumeMl()).isEqualTo(FALLBACK_FOR_SMALL_POT);
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.ERROR);
    }

    // --- confidence -------------------------------------------------------

    @Test
    void lowConfidenceTakesTheConservativeOfAiAndFallback() {
        stub(AiOutcome.OK, prediction(200, 0.2));

        assertThat(resolver.resolveVolume(SMALL_POT_ML, features()).volumeMl())
                .isEqualTo(FALLBACK_FOR_SMALL_POT);
    }

    @Test
    void lowConfidenceKeepsTheAiVolumeWhenItIsTheSmallerOne() {
        stub(AiOutcome.OK, prediction(20, 0.2));

        assertThat(resolver.resolveVolume(SMALL_POT_ML, features()).volumeMl()).isEqualTo(20);
    }

    @Test
    void highConfidenceKeepsTheAiVolumeEvenWhenItExceedsTheFallback() {
        stub(AiOutcome.OK, prediction(200, 0.9));

        assertThat(resolver.resolveVolume(SMALL_POT_ML, features()).volumeMl()).isEqualTo(200);
    }

    // --- disabled ---------------------------------------------------------

    @Test
    void disabledUsesTheFallbackAndIssuesNoHttpRequest() {
        // A real client this time, so "no HTTP call" is verified at the transport
        // layer rather than assumed from the outcome enum.
        AiProperties disabled = properties(false);
        RestClient.Builder builder = RestClient.builder().baseUrl(disabled.baseUrl());
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        var realResolver = new IrrigationVolumeResolver(
                new IrrigationAiClient(disabled, builder.build()), disabled);

        var resolved = realResolver.resolveVolume(SMALL_POT_ML, features());

        assertThat(resolved.volumeMl()).isEqualTo(FALLBACK_FOR_SMALL_POT);
        assertThat(resolved.outcome()).isEqualTo(AiOutcome.DISABLED);
        assertThat(resolved.modelVersion()).isNull();
        server.verify();
    }
}
