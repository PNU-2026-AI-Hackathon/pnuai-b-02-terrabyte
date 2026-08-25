"""API key enforcement, which only exists when AI_API_KEY is set."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

API_KEY = "test-key-9f3a"

REQUEST = {
    "input_schema_version": 1,
    "soil_moisture_pct": 18.0,
    "air_temperature_c": 27.0,
    "air_humidity_pct": 45.0,
}


@pytest.fixture
def secured_client(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", API_KEY)
    import app.main as main

    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client


def test_correct_key_is_accepted(secured_client):
    response = secured_client.post(
        "/predict/irrigation", json=REQUEST, headers={"X-Api-Key": API_KEY}
    )
    assert response.status_code == 200


def test_missing_key_is_rejected(secured_client):
    response = secured_client.post("/predict/irrigation", json=REQUEST)
    assert response.status_code == 401


def test_wrong_key_is_rejected(secured_client):
    response = secured_client.post(
        "/predict/irrigation", json=REQUEST, headers={"X-Api-Key": "wrong"}
    )
    assert response.status_code == 401


def test_health_stays_open_for_the_container_healthcheck(secured_client):
    """The Docker healthcheck has no credentials, so /health must not need one."""

    assert secured_client.get("/health").status_code == 200
