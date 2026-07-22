package com.terrabyte.backend.measurement;

import com.terrabyte.backend.api.ApiException;
import org.springframework.http.HttpStatus;

public enum MeasurementMetric {
    SOIL_MOISTURE_PCT("soil_moisture_pct", "%"),
    SOIL_MOISTURE_RAW_ADC("soil_moisture_raw_adc", "adc"),
    AIR_TEMPERATURE_C("air_temperature_c", "℃"),
    AIR_HUMIDITY_PCT("air_humidity_pct", "%"),
    PLANT_LIGHT_PPFD_UMOL_M2_S("plant_light_ppfd_umol_m2_s", "μmol/m²/s");

    private final String field;
    private final String unit;

    MeasurementMetric(String field, String unit) {
        this.field = field;
        this.unit = unit;
    }

    public String field() {
        return field;
    }

    public String unit() {
        return unit;
    }

    public static MeasurementMetric from(String value) {
        for (MeasurementMetric metric : values()) {
            if (metric.field.equals(value)) {
                return metric;
            }
        }
        throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "UNSUPPORTED_METRIC",
                "지원하지 않는 측정 지표입니다.");
    }
}
