"""The HTTP contract the backend will code against."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from terrabyte_ai.features import INPUT_SCHEMA_VERSION


def body(**overrides) -> dict:
    payload = {
        "input_schema_version": INPUT_SCHEMA_VERSION,
        "pot_id": 42,
        "crop_code": "cherry_tomato",
        "substrate_volume_ml": 3000,
        "soil_moisture_pct": 18.0,
        "soil_temperature_c": 21.5,
        "air_temperature_c": 27.0,
        "air_humidity_pct": 45.0,
        "plant_light_ppfd_umol_m2_s": 520.0,
        "hours_since_last_irrigation": 30.0,
    }
    payload.update(overrides)
    return {key: value for key, value in payload.items() if value is not None}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as started:
        yield started


def test_health_reports_the_loaded_model(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["model_version"] == "irrigation-reg-v1"
    assert payload["input_schema_version"] == INPUT_SCHEMA_VERSION
    assert payload["loaded_at"]


def test_predict_returns_the_documented_shape(client):
    response = client.post("/predict/irrigation", json=body())
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {
        "volume_ml",
        "confidence",
        "model_version",
        "input_schema_version",
        "imputed",
        "latency_ms",
    }
    assert isinstance(payload["volume_ml"], int)
    assert 0.0 <= payload["confidence"] <= 1.0
    assert payload["imputed"] == []


def test_missing_required_feature_is_rejected(client):
    response = client.post("/predict/irrigation", json=body(soil_moisture_pct=None))
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_FEATURES"


@pytest.mark.parametrize("value", [-5.0, 150.0])
def test_out_of_range_feature_is_rejected(client, value):
    response = client.post("/predict/irrigation", json=body(soil_moisture_pct=value))
    assert response.status_code == 422
    assert "soil_moisture_pct" in " ".join(response.json()["details"])


def test_schema_version_mismatch_is_rejected(client):
    """The backend falls back on a mismatch; it must be told, not guessed at."""

    response = client.post("/predict/irrigation", json=body(input_schema_version=99))
    assert response.status_code == 422
    assert "input_schema_version" in " ".join(response.json()["details"])


def test_optional_feature_is_imputed_and_reported(client):
    """soil_temperature_c is not collected until envelope v2, so this is the
    normal production path today, not an edge case."""

    response = client.post("/predict/irrigation", json=body(soil_temperature_c=None))
    assert response.status_code == 200
    assert "soil_temperature_c" in response.json()["imputed"]


def test_unknown_crop_is_served_not_refused(client):
    response = client.post("/predict/irrigation", json=body(crop_code="dragonfruit"))
    assert response.status_code == 200
    assert response.json()["confidence"] <= 0.3


def test_drier_soil_gets_more_water(client):
    dry = client.post("/predict/irrigation", json=body(soil_moisture_pct=10.0)).json()
    wet = client.post("/predict/irrigation", json=body(soil_moisture_pct=40.0)).json()
    assert dry["volume_ml"] > wet["volume_ml"]


def test_bigger_pot_gets_more_water(client):
    small = client.post("/predict/irrigation", json=body(substrate_volume_ml=800)).json()
    large = client.post("/predict/irrigation", json=body(substrate_volume_ml=5000)).json()
    assert large["volume_ml"] > small["volume_ml"]


def test_health_reports_latency_after_a_prediction(client):
    client.post("/predict/irrigation", json=body())
    assert client.get("/health").json()["last_latency_ms"] is not None


def test_unknown_fields_are_ignored(client):
    """The backend may send extra context; that must not break the call."""

    response = client.post(
        "/predict/irrigation", json=body(observed_at="2026-08-16T04:00:00Z")
    )
    assert response.status_code == 200
