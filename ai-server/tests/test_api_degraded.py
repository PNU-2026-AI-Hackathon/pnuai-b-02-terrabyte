"""Behaviour when the model artifact is missing.

Separate module because the app loads its artifact once at startup, so this
needs its own TestClient with a different environment.

The failure this guards against: a server that answers with a made-up number
when it has no model. Silence is safe here -- the backend has a fallback table.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def degraded_client(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_MODEL_PATH", str(tmp_path / "missing.joblib"))
    import app.main as main

    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client


def test_health_is_degraded_without_a_model(degraded_client):
    response = degraded_client.get("/health")
    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["model_version"] is None


def test_predict_refuses_rather_than_inventing_a_volume(degraded_client):
    response = degraded_client.post(
        "/predict/irrigation",
        json={
            "input_schema_version": 1,
            "soil_moisture_pct": 18.0,
            "air_temperature_c": 27.0,
            "air_humidity_pct": 45.0,
        },
    )
    assert response.status_code == 503
    assert response.json()["code"] == "MODEL_UNAVAILABLE"
    assert "volume_ml" not in response.json()
