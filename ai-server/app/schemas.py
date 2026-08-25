"""Request and response bodies.

Field names are snake_case to match the backend's ``@JsonNaming(SnakeCaseStrategy)``
and, for the sensor fields, the ``MeasurementMetric`` enum values literally.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from terrabyte_ai.features import FEATURE_RANGES, INPUT_SCHEMA_VERSION


def _range(name: str) -> tuple[float, float]:
    return FEATURE_RANGES[name]


class PredictIrrigationRequest(BaseModel):
    """Bounds are duplicated from FEATURE_RANGES so FastAPI can reject bad input
    before any model code runs and so they show up in the OpenAPI schema.
    ``FeatureVector`` re-checks them -- that is the authoritative pass."""

    model_config = ConfigDict(extra="ignore")

    input_schema_version: int = Field(
        default=INPUT_SCHEMA_VERSION,
        description="계약 버전. 서버 기대값과 다르면 422",
    )
    pot_id: int | None = Field(
        default=None, description="로그 상관용. 예측에는 쓰이지 않는다"
    )
    crop_code: str | None = Field(
        default=None, description="미지정·미학습 코드도 허용되며 신뢰도가 낮아진다"
    )

    soil_moisture_pct: float = Field(..., ge=_range("soil_moisture_pct")[0], le=_range("soil_moisture_pct")[1])
    air_temperature_c: float = Field(..., ge=_range("air_temperature_c")[0], le=_range("air_temperature_c")[1])
    air_humidity_pct: float = Field(..., ge=_range("air_humidity_pct")[0], le=_range("air_humidity_pct")[1])

    soil_temperature_c: float | None = Field(
        default=None, ge=_range("soil_temperature_c")[0], le=_range("soil_temperature_c")[1]
    )
    plant_light_ppfd_umol_m2_s: float | None = Field(
        default=None,
        ge=_range("plant_light_ppfd_umol_m2_s")[0],
        le=_range("plant_light_ppfd_umol_m2_s")[1],
    )
    hours_since_last_irrigation: float | None = Field(
        default=None,
        ge=_range("hours_since_last_irrigation")[0],
        le=_range("hours_since_last_irrigation")[1],
    )
    substrate_volume_ml: float | None = Field(
        default=None, ge=_range("substrate_volume_ml")[0], le=_range("substrate_volume_ml")[1]
    )


class PredictIrrigationResponse(BaseModel):
    volume_ml: int = Field(..., description="권장 관수량. 클램프되지 않은 원본 예측")
    confidence: float = Field(..., description="앙상블 합의도 0~1. 확률이 아니다")
    model_version: str
    input_schema_version: int
    imputed: list[str] = Field(
        default_factory=list, description="대치된 피처 이름. 비어 있으면 전부 실측"
    )
    latency_ms: float


class HealthResponse(BaseModel):
    status: str
    model_version: str | None
    input_schema_version: int
    loaded_at: str | None = None
    last_latency_ms: float | None = None
    detail: str | None = None


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: list[str] = Field(default_factory=list)
