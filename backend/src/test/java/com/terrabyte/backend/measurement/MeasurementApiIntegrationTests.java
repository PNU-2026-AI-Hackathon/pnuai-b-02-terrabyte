package com.terrabyte.backend.measurement;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
import com.terrabyte.backend.device.RegisterDeviceRequest;
import com.terrabyte.backend.score.CropScoreProfile;
import com.terrabyte.backend.score.CropScoreProfileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "app.telemetry.http-ingest.enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MeasurementApiIntegrationTests {

    private static final String HARDWARE_ID = "orangepi-pro-01";
    private static final String SERIAL_CODE = "483920";
    private static final String NODE_ID = "pot-01";

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @MockitoBean
    private MeasurementStore measurementStore;

    @MockitoBean
    private CropScoreProfileRepository profileRepository;

    @Autowired
    MeasurementApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @BeforeEach
    void resetData() {
        jdbcTemplate.update("""
                UPDATE device
                SET user_id = NULL, space_id = NULL, claimed_at = NULL,
                    status = 'OFFLINE', last_seen_at = NULL
                """);
        jdbcTemplate.update("UPDATE pot SET node_id=NULL,crop_code=NULL,crop_selected_at=NULL,status='OFFLINE',last_seen_at=NULL");
        jdbcTemplate.update("DELETE FROM app_user");
        jdbcTemplate.update("DELETE FROM telemetry_event");
    }

    @Test
    void acceptsHardwareTelemetryAndMarksDeviceOnline() throws Exception {
        Instant observedAt = Instant.now().minusSeconds(5);

        mockMvc.perform(post("/api/telemetry")
                        .contentType(APPLICATION_JSON)
                        .content(telemetryBody(HARDWARE_ID, UUID.randomUUID().toString(), observedAt, NODE_ID, 1042, 58.0)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true))
                .andExpect(jsonPath("$.hardwareDeviceId").value(HARDWARE_ID))
                .andExpect(jsonPath("$.sequence").value(1042));

        verify(measurementStore).write(any(TelemetrySample.class));
        String statusValue = jdbcTemplate.queryForObject(
                "SELECT status FROM device WHERE hardware_id = ?",
                String.class,
                HARDWARE_ID);
        assertThat(statusValue).isEqualTo("ONLINE");
    }

    @Test
    void rejectsSchemaVersionOneAndInvalidMeasurement() throws Exception {
        Instant observedAt = Instant.now().minusSeconds(5);

        mockMvc.perform(post("/api/telemetry")
                        .contentType(APPLICATION_JSON)
                        .content(telemetryBody(
                                1, HARDWARE_ID, UUID.randomUUID().toString(), observedAt, NODE_ID, 1042, 58.0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        mockMvc.perform(post("/api/telemetry")
                        .contentType(APPLICATION_JSON)
                        .content(telemetryBody(HARDWARE_ID, UUID.randomUUID().toString(), observedAt, NODE_ID, 1042, 101.0)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void rejectsUnknownHardwareDevice() throws Exception {
        mockMvc.perform(post("/api/telemetry")
                        .contentType(APPLICATION_JSON)
                        .content(telemetryBody(
                                "unknown-device", UUID.randomUUID().toString(),
                                Instant.now().minusSeconds(5), NODE_ID, 1, 58.0)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DEVICE_NOT_FOUND"));
    }

    @Test
    void ignoresDuplicateEventIdWithoutWritingASecondSample() throws Exception {
        Instant observedAt = Instant.now().minusSeconds(5);
        String eventId = UUID.randomUUID().toString();
        String body = telemetryBody(HARDWARE_ID, eventId, observedAt, NODE_ID, 1042, 58.0);

        mockMvc.perform(post("/api/telemetry").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true));
        mockMvc.perform(post("/api/telemetry").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true));

        verify(measurementStore, times(1)).write(any(TelemetrySample.class));
    }

    @Test
    void acceptsEnvelopeWithoutSoilMoistureRawAdc() throws Exception {
        Instant observedAt = Instant.now().minusSeconds(5);
        String body = objectMapper.writeValueAsString(new TelemetryEnvelope(
                2,
                "telemetry.sample",
                HARDWARE_ID,
                UUID.randomUUID().toString(),
                observedAt,
                List.of(new TelemetryEnvelope.Node(
                        NODE_ID,
                        1,
                        new TelemetryEnvelope.Measurements(
                                27.1, 58.0, null, 230.5, null, null, null),
                        new TelemetryEnvelope.Quality(true, true, null),
                        null))));

        mockMvc.perform(post("/api/telemetry").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true));

        verify(measurementStore).write(any(TelemetrySample.class));
    }

    @Test
    void bindsOnePotPerNodeForAMultiNodeEnvelope() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        Instant observedAt = Instant.now().minusSeconds(5);

        String body = objectMapper.writeValueAsString(new TelemetryEnvelope(
                2,
                "telemetry.sample",
                HARDWARE_ID,
                UUID.randomUUID().toString(),
                observedAt,
                List.of(
                        node("node-a", 1),
                        node("node-b", 2))));

        mockMvc.perform(post("/api/telemetry").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.sequence").value(2));

        List<String> nodeIds = jdbcTemplate.queryForList(
                "SELECT node_id FROM pot WHERE device_id = ? ORDER BY node_id", String.class, deviceId);
        assertThat(nodeIds).containsExactly("node-a", "node-b");
        verify(measurementStore, times(2)).write(any(TelemetrySample.class));
    }

    @Test
    void carriesSoilTemperatureFromEnvelopeThroughToTheStoredSample() throws Exception {
        Instant observedAt = Instant.now().minusSeconds(5);
        String body = objectMapper.writeValueAsString(new TelemetryEnvelope(
                2,
                "telemetry.sample",
                HARDWARE_ID,
                UUID.randomUUID().toString(),
                observedAt,
                List.of(new TelemetryEnvelope.Node(
                        NODE_ID,
                        1,
                        new TelemetryEnvelope.Measurements(
                                27.1, 58.0, null, 230.5, 19.4, 45.0, 1847L),
                        new TelemetryEnvelope.Quality(true, true, true),
                        null))));

        mockMvc.perform(post("/api/telemetry").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());

        org.mockito.ArgumentCaptor<TelemetrySample> captor =
                org.mockito.ArgumentCaptor.forClass(TelemetrySample.class);
        verify(measurementStore).write(captor.capture());
        assertThat(captor.getValue().soilTemperatureC()).isEqualTo(19.4);
    }

    @Test
    void treatsAnAbsentSoilTemperatureAsNullRatherThanZero() throws Exception {
        Instant observedAt = Instant.now().minusSeconds(5);
        String body = objectMapper.writeValueAsString(new TelemetryEnvelope(
                2,
                "telemetry.sample",
                HARDWARE_ID,
                UUID.randomUUID().toString(),
                observedAt,
                List.of(new TelemetryEnvelope.Node(
                        NODE_ID,
                        1,
                        new TelemetryEnvelope.Measurements(
                                27.1, 58.0, null, 230.5, null, null, null),
                        new TelemetryEnvelope.Quality(true, true, null),
                        null))));

        mockMvc.perform(post("/api/telemetry").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());

        org.mockito.ArgumentCaptor<TelemetrySample> captor =
                org.mockito.ArgumentCaptor.forClass(TelemetrySample.class);
        verify(measurementStore).write(captor.capture());
        // Must be null, not 0.0 — a confident 0°C is indistinguishable from a
        // real cold reading, whereas null correctly says "no probe wired in".
        assertThat(captor.getValue().soilTemperatureC()).isNull();
    }

    @Test
    void carriesTheEdgeIrrigationSuggestionThroughToTheStoredSample() throws Exception {
        // Raw JSON rather than a serialised record: this pins the wire names the
        // edge actually sends, which serialising our own record cannot do.
        String body = telemetryBodyWithSuggestion("""
                ,"irrigation_suggestion":{"volume_ml":118,\
                "model_version":"water-balance-v1",\
                "assumed_crop_code":"lettuce",\
                "assumed_substrate_volume_ml":3000}""");

        mockMvc.perform(post("/api/telemetry").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());

        org.mockito.ArgumentCaptor<TelemetrySample> captor =
                org.mockito.ArgumentCaptor.forClass(TelemetrySample.class);
        verify(measurementStore).write(captor.capture());
        assertThat(captor.getValue().irrigationSuggestion())
                .isEqualTo(new IrrigationSuggestion(118, "water-balance-v1", "lettuce", 3000));
    }

    @Test
    void acceptsAnEnvelopeWithNoIrrigationSuggestionAtAll() throws Exception {
        // The edge omits the block whenever it cannot compute a dose, which is
        // an ordinary reading and must not be refused.
        mockMvc.perform(post("/api/telemetry")
                        .contentType(APPLICATION_JSON)
                        .content(telemetryBodyWithSuggestion("")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(true));

        org.mockito.ArgumentCaptor<TelemetrySample> captor =
                org.mockito.ArgumentCaptor.forClass(TelemetrySample.class);
        verify(measurementStore).write(captor.capture());
        assertThat(captor.getValue().irrigationSuggestion()).isNull();
    }

    @Test
    void rejectsAnIrrigationSuggestionOutsideTheContractedRange() throws Exception {
        mockMvc.perform(post("/api/telemetry")
                        .contentType(APPLICATION_JSON)
                        .content(telemetryBodyWithSuggestion("""
                                ,"irrigation_suggestion":{"volume_ml":501,\
                                "model_version":"water-balance-v1"}""")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void returnsLatestAndTimeSeriesForDeviceOwner() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = jdbcTemplate.queryForObject("SELECT MIN(id) FROM pot WHERE device_id=?", Long.class, deviceId);
        selectCrop(token, deviceId, "lettuce");
        TelemetrySample sample = sample(potId, deviceId, Instant.now().minusSeconds(5));
        TelemetrySample earlierSample = new TelemetrySample(
                potId, deviceId, NODE_ID, "lettuce", HARDWARE_ID, UUID.randomUUID().toString(),
                Instant.now().minusSeconds(60 * 60), 1041,
                40.0, 1700, 20.0, 50.0, null, 500.0, 20.0,
                true, true, true, null);
        when(measurementStore.findLatest(potId)).thenReturn(java.util.Optional.of(sample));
        when(measurementStore.findSamples(eq(potId), any(Instant.class))).thenReturn(List.of(earlierSample, sample));
        when(measurementStore.findPoints(
                eq(potId),
                eq(MeasurementMetric.AIR_TEMPERATURE_C),
                any(Instant.class)))
                .thenReturn(List.of(new MeasurementPoint(sample.observedAt(), 27.1)));
        when(profileRepository.findActiveByCropCode("lettuce"))
                .thenReturn(java.util.Optional.of(profile("lettuce", "상추")));

        mockMvc.perform(get("/api/devices/{deviceId}/measurements/latest", deviceId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hardwareDeviceId").value(HARDWARE_ID))
                .andExpect(jsonPath("$.measurements.airTemperatureC").value(27.1))
                .andExpect(jsonPath("$.measurements.plantLightPpfdUmolM2S").value(230.5))
                .andExpect(jsonPath("$.measurements.soilTemperatureC").value(21.0))
                // lux 가 없는 레거시 표본이라 저장된 PPFD 를 그대로 쓴다.
                .andExpect(jsonPath("$.ppfdBasis").value("LEGACY_DEVICE_VALUE"))
                .andExpect(jsonPath("$.quality.airSensorValid").value(true));

        mockMvc.perform(get("/api/devices/{deviceId}/measurements", deviceId)
                        .header("Authorization", bearer(token))
                        .queryParam("metric", "air_temperature_c")
                        .queryParam("range", "24h"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metric").value("air_temperature_c"))
                .andExpect(jsonPath("$.unit").value("℃"))
                .andExpect(jsonPath("$.points[0].value").value(27.1));

        when(measurementStore.findPoints(
                eq(potId),
                eq(MeasurementMetric.SOIL_TEMPERATURE_C),
                any(Instant.class)))
                .thenReturn(List.of(new MeasurementPoint(sample.observedAt(), 21.0)));

        mockMvc.perform(get("/api/devices/{deviceId}/measurements", deviceId)
                        .header("Authorization", bearer(token))
                        .queryParam("metric", "soil_temperature_c")
                        .queryParam("range", "24h"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metric").value("soil_temperature_c"))
                .andExpect(jsonPath("$.unit").value("℃"))
                .andExpect(jsonPath("$.points[0].value").value(21.0));

        mockMvc.perform(get("/api/devices/{deviceId}/score", deviceId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cropCode").value("lettuce"))
                .andExpect(jsonPath("$.cropName").value("상추"))
                .andExpect(jsonPath("$.total").value(98.3))
                .andExpect(jsonPath("$.grade").value("GOOD"))
                .andExpect(jsonPath("$.factors[0].key").value("temperature"))
                .andExpect(jsonPath("$.factors[0].current").value(23.55))
                .andExpect(jsonPath("$.factors[2].key").value("plantLight"))
                .andExpect(jsonPath("$.factors[2].current").value(365.25))
                .andExpect(jsonPath("$.factors[2].score").value(100.0))
                // 적합도 축은 온도·습도·광량 셋뿐이다. 토양 항목이 다시 실리면
                // 점수에 기여하지 않으면서 적합도처럼 읽히므로 개수를 고정한다.
                .andExpect(jsonPath("$.factors.length()").value(3));
    }

    @Test
    void 공간_광원_계수로_PPFD_를_유도해_응답한다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        setLightSource(deviceId, "INDOOR_LIGHTING");
        when(measurementStore.findLatest(potId)).thenReturn(java.util.Optional.of(
                sampleWithLux(potId, deviceId, Instant.now().minusSeconds(5), 10000.0)));

        mockMvc.perform(get("/api/pots/{potId}/measurements/latest", potId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                // 실내 조명 0.0135 × 10000 lx = 135.0
                .andExpect(jsonPath("$.measurements.plantLightPpfdUmolM2S").value(135.0))
                .andExpect(jsonPath("$.ppfdBasis").value("USER_SELECTED"));
    }

    @Test
    void 광원_미설정이면_공간_유형으로_추정한_계수를_쓴다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        when(measurementStore.findLatest(potId)).thenReturn(java.util.Optional.of(
                sampleWithLux(potId, deviceId, Instant.now().minusSeconds(5), 10000.0)));

        mockMvc.perform(get("/api/pots/{potId}/measurements/latest", potId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                // 등록 시 만든 공간의 유형은 "건물 옥상" → 자연광 0.0185
                .andExpect(jsonPath("$.measurements.plantLightPpfdUmolM2S").value(185.0))
                .andExpect(jsonPath("$.ppfdBasis").value("INFERRED_FROM_SPACE_TYPE"));
    }

    @Test
    void PPFD_시계열은_lux_를_공간_광원으로_환산한다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        setLightSource(deviceId, "INDOOR_LIGHTING");
        Instant observedAt = Instant.now().minusSeconds(5);
        when(measurementStore.findPoints(
                eq(potId), eq(MeasurementMetric.ILLUMINANCE_LUX), any(Instant.class)))
                .thenReturn(List.of(new MeasurementPoint(observedAt, 10000.0)));

        mockMvc.perform(get("/api/pots/{potId}/measurements", potId)
                        .header("Authorization", bearer(token))
                        .queryParam("metric", "plant_light_ppfd_umol_m2_s")
                        .queryParam("range", "24h"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metric").value("plant_light_ppfd_umol_m2_s"))
                .andExpect(jsonPath("$.unit").value("μmol/m²/s"))
                .andExpect(jsonPath("$.points[0].value").value(135.0));
    }

    @Test
    void lux_구간이_없으면_저장된_PPFD_시계열을_그대로_돌려준다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        setLightSource(deviceId, "INDOOR_LIGHTING");
        Instant observedAt = Instant.now().minusSeconds(5);
        // ILLUMINANCE_LUX 는 스텁하지 않는다 → 빈 목록(= lux 도입 이전 구간)
        when(measurementStore.findPoints(
                eq(potId), eq(MeasurementMetric.PLANT_LIGHT_PPFD_UMOL_M2_S), any(Instant.class)))
                .thenReturn(List.of(new MeasurementPoint(observedAt, 230.5)));

        mockMvc.perform(get("/api/pots/{potId}/measurements", potId)
                        .header("Authorization", bearer(token))
                        .queryParam("metric", "plant_light_ppfd_umol_m2_s")
                        .queryParam("range", "24h"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.points[0].value").value(230.5));
    }

    /**
     * 이 기능의 존재 이유. 저장은 실측 lux 만 하므로, 광원 설정을 고치면
     * 이미 저장된 표본의 PPFD 까지 소급 정정된다.
     *
     * <p>두 번의 조회 사이에 텔레메트리를 다시 넣지 않는다. 재수집하면
     * "새 값이 새 계수로 들어왔다"만 증명할 뿐 소급 정정을 증명하지 못한다.
     * 화분별로 계수를 캐시하거나 수집 시점에 PPFD 를 저장하도록 바뀌면
     * 이 테스트가 깨져야 한다.
     */
    @Test
    void 광원을_고치면_이미_저장된_표본의_PPFD_가_소급_정정된다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        setLightSource(deviceId, "INDOOR_LIGHTING");
        when(measurementStore.findLatest(potId)).thenReturn(java.util.Optional.of(
                sampleWithLux(potId, deviceId, Instant.now().minusSeconds(5), 10000.0)));

        mockMvc.perform(get("/api/pots/{potId}/measurements/latest", potId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.measurements.plantLightPpfdUmolM2S").value(135.0));

        setLightSource(deviceId, "NATURAL_LIGHT");

        // 같은 표본, 같은 lux. 계수만 0.0135 → 0.0185 로 바뀐다.
        mockMvc.perform(get("/api/pots/{potId}/measurements/latest", potId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.measurements.plantLightPpfdUmolM2S").value(185.0));
    }

    /** 시계열도 같은 보장을 받는다. 그래야 그래프 전체가 소급 정정된다. */
    @Test
    void 광원을_고치면_PPFD_시계열_전체가_소급_정정된다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        setLightSource(deviceId, "INDOOR_LIGHTING");
        Instant observedAt = Instant.now().minusSeconds(5);
        when(measurementStore.findPoints(
                eq(potId), eq(MeasurementMetric.ILLUMINANCE_LUX), any(Instant.class)))
                .thenReturn(List.of(
                        new MeasurementPoint(observedAt.minusSeconds(3600), 10000.0),
                        new MeasurementPoint(observedAt, 20000.0)));

        mockMvc.perform(get("/api/pots/{potId}/measurements", potId)
                        .header("Authorization", bearer(token))
                        .queryParam("metric", "plant_light_ppfd_umol_m2_s"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.points[0].value").value(135.0))
                .andExpect(jsonPath("$.points[1].value").value(270.0));

        setLightSource(deviceId, "NATURAL_LIGHT");

        mockMvc.perform(get("/api/pots/{potId}/measurements", potId)
                        .header("Authorization", bearer(token))
                        .queryParam("metric", "plant_light_ppfd_umol_m2_s"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.points[0].value").value(185.0))
                .andExpect(jsonPath("$.points[1].value").value(370.0));
    }

    @Test
    void 점수도_유도된_PPFD_를_광량_인자로_쓴다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        selectCrop(token, deviceId, "lettuce");
        setLightSource(deviceId, "INDOOR_LIGHTING");
        TelemetrySample sample = sampleWithLux(
                potId, deviceId, Instant.now().minusSeconds(5), 10000.0);
        when(measurementStore.findLatest(potId)).thenReturn(java.util.Optional.of(sample));
        when(measurementStore.findSamples(eq(potId), any(Instant.class))).thenReturn(List.of(sample));
        when(profileRepository.findActiveByCropCode("lettuce"))
                .thenReturn(java.util.Optional.of(profile("lettuce", "상추")));

        mockMvc.perform(get("/api/pots/{potId}/score", potId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.factors[2].key").value("plantLight"))
                .andExpect(jsonPath("$.factors[2].current").value(135.0));
    }

    @Test
    void 광량_값이_전혀_없으면_점수를_계산하지_않는다() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        long potId = firstPotId(deviceId);
        selectCrop(token, deviceId, "lettuce");
        TelemetrySample sample = sampleWithLux(potId, deviceId, Instant.now().minusSeconds(5), null);
        when(measurementStore.findLatest(potId)).thenReturn(java.util.Optional.of(sample));
        when(measurementStore.findSamples(eq(potId), any(Instant.class))).thenReturn(List.of(sample));
        when(profileRepository.findActiveByCropCode("lettuce"))
                .thenReturn(java.util.Optional.of(profile("lettuce", "상추")));

        mockMvc.perform(get("/api/pots/{potId}/score", potId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("INVALID_SCORE_INPUT"));

        // 값이 없으면 근거도 싣지 않는다.
        mockMvc.perform(get("/api/pots/{potId}/measurements/latest", potId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.measurements.plantLightPpfdUmolM2S").doesNotExist())
                .andExpect(jsonPath("$.ppfdBasis").doesNotExist());
    }

    @Test
    void rejectsUnsupportedSeriesParameters() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);

        mockMvc.perform(get("/api/devices/{deviceId}/measurements", deviceId)
                        .header("Authorization", bearer(token))
                        .queryParam("metric", "co2")
                        .queryParam("range", "24h"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_METRIC"));
    }

    private TelemetryEnvelope.Node node(String nodeId, long sequence) {
        return new TelemetryEnvelope.Node(
                nodeId,
                sequence,
                new TelemetryEnvelope.Measurements(27.0, 58.0, null, 230.0, 21.0, 40.0, 1000L),
                new TelemetryEnvelope.Quality(true, true, true),
                null);
    }

    /** One node, with {@code suggestionJson} spliced in verbatim (may be empty). */
    private String telemetryBodyWithSuggestion(String suggestionJson) {
        return """
                {"schema_version":2,"event_type":"telemetry.sample",\
                "gateway_id":"%s","event_id":"%s","observed_at":"%s",\
                "nodes":[{"node_id":"%s","sequence":7,\
                "measurements":{"air_temperature_c":27.1,"air_humidity_pct":58.0,\
                "plant_light_ppfd_umol_m2_s":230.5},\
                "quality":{"air_sensor_valid":true,"light_sensor_valid":true,\
                "soil_sensor_valid":false}%s}]}"""
                .formatted(
                        HARDWARE_ID,
                        UUID.randomUUID(),
                        Instant.now().minusSeconds(5),
                        NODE_ID,
                        suggestionJson);
    }

    private String telemetryBody(
            String hardwareId,
            String eventId,
            Instant observedAt,
            String nodeId,
            long sequence,
            double humidity) throws Exception {
        return telemetryBody(2, hardwareId, eventId, observedAt, nodeId, sequence, humidity);
    }

    private String telemetryBody(
            int schemaVersion,
            String hardwareId,
            String eventId,
            Instant observedAt,
            String nodeId,
            long sequence,
            double humidity) throws Exception {
        TelemetryEnvelope envelope = new TelemetryEnvelope(
                schemaVersion,
                "telemetry.sample",
                hardwareId,
                eventId,
                observedAt,
                List.of(new TelemetryEnvelope.Node(
                        nodeId,
                        sequence,
                        new TelemetryEnvelope.Measurements(
                                27.1, humidity, null, 230.5, 31.2, 45.0, 1847L),
                        new TelemetryEnvelope.Quality(true, true, true),
                        null)));
        return objectMapper.writeValueAsString(envelope);
    }

    private TelemetrySample sample(long potId, long deviceId, Instant observedAt) {
        return new TelemetrySample(
                potId,
                deviceId,
                NODE_ID,
                "lettuce",
                HARDWARE_ID,
                UUID.randomUUID().toString(),
                observedAt,
                1042,
                58.0,
                1847,
                27.1,
                58.0,
                null,
                230.5,
                21.0,
                true,
                true,
                true,
                null);
    }

    private TelemetrySample sampleWithLux(
            long potId, long deviceId, Instant observedAt, Double illuminanceLux) {
        return new TelemetrySample(
                potId,
                deviceId,
                NODE_ID,
                "lettuce",
                HARDWARE_ID,
                UUID.randomUUID().toString(),
                observedAt,
                1042,
                58.0,
                1847,
                27.1,
                58.0,
                illuminanceLux,
                // 신규 노드는 PPFD 를 보내지 않는다. 서버가 lux 로 유도한다.
                null,
                21.0,
                true,
                true,
                true,
                null);
    }

    private long firstPotId(long deviceId) {
        return jdbcTemplate.queryForObject(
                "SELECT MIN(id) FROM pot WHERE device_id=?", Long.class, deviceId);
    }

    private void setLightSource(long deviceId, String lightSource) {
        jdbcTemplate.update(
                """
                UPDATE cultivation_space SET light_source = ?
                WHERE id = (SELECT space_id FROM device WHERE id = ?)
                """,
                lightSource,
                deviceId);
    }

    private CropScoreProfile profile(String cropCode, String cropName) {
        return new CropScoreProfile(
                cropCode, cropName,
                15, 24, 30, 36,
                30, 50, 70, 90,
                0, 260, 500, 750);
    }

    private String signupAndGetToken() throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest("sensor-owner@example.com", "password1", "센서소유자"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asText();
    }

    private long registerAndGetDeviceId(String token) throws Exception {
        RegisterDeviceRequest request = new RegisterDeviceRequest(
                SERIAL_CODE,
                "부산 도심 옥상 A",
                "건물 옥상",
                new BigDecimal("42"));
        String response = mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return json.get("id").asLong();
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private void selectCrop(String token, long deviceId, String cropCode) throws Exception {
        mockMvc.perform(patch("/api/devices/{deviceId}/crop", deviceId)
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("{\"cropCode\":\"" + cropCode + "\"}"))
                .andExpect(status().isOk());
    }
}
