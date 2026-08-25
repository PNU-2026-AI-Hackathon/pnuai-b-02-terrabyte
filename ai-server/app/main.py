"""FastAPI app: recommends how much water, never whether to water.

The rule engine decides that irrigation is needed; this server only sizes the
dose; the Governor approves, clamps, or denies it. See
``docs/design/edge_ai_hardening.md`` §3.2.

Two rules shape the error handling here:

* Never clamp. An out-of-range prediction must reach the backend intact so it
  falls back and records the anomaly, instead of a broken model quietly shipping
  a plausible-looking number (D15).
* Never return 500. Every failure is either 422 (the caller's input) or 503
  (this server), so the backend's ``ai_predict{outcome=...}`` metric can tell
  the two apart.
"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import Settings
from app.schemas import (
    ErrorResponse,
    HealthResponse,
    PredictIrrigationRequest,
    PredictIrrigationResponse,
)
from terrabyte_ai.features import INPUT_SCHEMA_VERSION, FeatureError
from terrabyte_ai.predictor import ArtifactError, IrrigationPredictor

# Starlette renamed HTTP_422_UNPROCESSABLE_ENTITY to _CONTENT; the literal
# works on both and needs no version guard.
HTTP_422_UNPROCESSABLE = 422

# Above this the model is almost certainly broken. The server still returns the
# value -- the backend decides to fall back -- but it must be visible in the log.
HARD_CEILING_ML = 500

logger = logging.getLogger("terrabyte.ai")


class State:
    """Module-level state so /health can report a load failure instead of the
    container dying. The backend treats an absent AI as a normal fallback path,
    so crashing on a bad artifact would be the less useful failure."""

    predictor: IrrigationPredictor | None = None
    load_error: str | None = None
    last_latency_ms: float | None = None


def _warm_up(predictor: IrrigationPredictor) -> None:
    """Spend the first prediction's cost at startup instead of on a real request.

    Cold, the first call takes ~100 ms (numpy and sklearn initialise lazily);
    warm, ~30 ms. Without this the backend's very first irrigation decision is
    the one closest to the 800 ms timeout.
    """

    predictor.predict(
        {
            "soil_moisture_pct": 25.0,
            "air_temperature_c": 22.0,
            "air_humidity_pct": 50.0,
        }
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings.from_environment()
    try:
        State.predictor = IrrigationPredictor.load(settings.model_path)
        State.load_error = None
        _warm_up(State.predictor)
        logger.info(
            "모델 로드 완료 version=%s path=%s",
            State.predictor.model_version,
            settings.model_path,
        )
    except ArtifactError as error:
        State.predictor = None
        State.load_error = str(error)
        logger.error("모델 로드 실패: %s", error)
    app.state.settings = settings
    yield


app = FastAPI(
    title="TerraByte 관수량 추천 서버",
    description=(
        "관수 **여부**는 결정하지 않는다. 룰 엔진이 관수가 필요하다고 판단한 뒤 "
        "**얼마나** 줄지만 제안하며, 최종 승인은 백엔드의 IrrigationGovernor가 한다."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


def _error(code: str, message: str, http_status: int, details: list[str] | None = None):
    return JSONResponse(
        status_code=http_status,
        content=ErrorResponse(code=code, message=message, details=details or []).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, error: RequestValidationError):
    """Pydantic's default 422 body is a nested structure; flatten it so the
    backend can log one readable line per offending field."""

    details = [
        f"{'.'.join(str(part) for part in item['loc'][1:])}: {item['msg']}"
        for item in error.errors()
    ]
    return _error(
        "INVALID_FEATURES",
        "요청 피처가 계약을 만족하지 않습니다",
        HTTP_422_UNPROCESSABLE,
        details,
    )


def _check_api_key(provided: str | None) -> JSONResponse | None:
    expected = app.state.settings.api_key
    if expected is None:
        return None
    if provided is None or not hmac.compare_digest(provided, expected):
        return _error("UNAUTHORIZED", "X-Api-Key가 올바르지 않습니다", status.HTTP_401_UNAUTHORIZED)
    return None


@app.get("/health", response_model=HealthResponse, responses={503: {"model": HealthResponse}})
def health():
    """503 keeps the container alive while telling the backend to fall back.

    docker-compose must depend on this service with ``service_started``, not
    ``service_healthy`` -- the backend has to start without a working AI.
    """

    if State.predictor is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=HealthResponse(
                status="degraded",
                model_version=None,
                input_schema_version=INPUT_SCHEMA_VERSION,
                detail=State.load_error or "모델이 로드되지 않았습니다",
            ).model_dump(),
        )
    return HealthResponse(
        status="ok",
        model_version=State.predictor.model_version,
        input_schema_version=INPUT_SCHEMA_VERSION,
        loaded_at=State.predictor.loaded_at,
        last_latency_ms=State.last_latency_ms,
    )


@app.post(
    "/predict/irrigation",
    response_model=PredictIrrigationResponse,
    responses={
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def predict_irrigation(
    payload: PredictIrrigationRequest,
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
):
    unauthorized = _check_api_key(x_api_key)
    if unauthorized is not None:
        return unauthorized

    if payload.input_schema_version != INPUT_SCHEMA_VERSION:
        return _error(
            "INVALID_FEATURES",
            "input_schema_version가 서버 기대값과 다릅니다",
            HTTP_422_UNPROCESSABLE,
            [f"input_schema_version: 기대 {INPUT_SCHEMA_VERSION}, 수신 {payload.input_schema_version}"],
        )

    if State.predictor is None:
        return _error(
            "MODEL_UNAVAILABLE",
            State.load_error or "모델이 로드되지 않았습니다",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    try:
        prediction = State.predictor.predict(payload.model_dump(exclude_none=True))
    except FeatureError as error:
        return _error(
            "INVALID_FEATURES",
            "요청 피처가 계약을 만족하지 않습니다",
            HTTP_422_UNPROCESSABLE,
            error.details,
        )

    State.last_latency_ms = prediction.latency_ms

    if prediction.volume_ml > HARD_CEILING_ML:
        # Returned as-is on purpose. The backend falls back and counts
        # outcome=out_of_range; this log is how the model gets blamed.
        logger.warning(
            "예측이 하드 상한을 넘었습니다 pot_id=%s volume_ml=%s model=%s",
            payload.pot_id,
            prediction.volume_ml,
            State.predictor.model_version,
        )

    return PredictIrrigationResponse(
        volume_ml=prediction.volume_ml,
        confidence=prediction.confidence,
        model_version=State.predictor.model_version,
        input_schema_version=INPUT_SCHEMA_VERSION,
        imputed=list(prediction.imputed),
        latency_ms=prediction.latency_ms,
    )
