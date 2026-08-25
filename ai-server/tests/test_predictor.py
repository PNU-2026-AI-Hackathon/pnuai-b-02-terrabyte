"""The trained artifact, loaded the way the server loads it.

These tests run against the committed model. If they fail after retraining, the
model changed in a way that matters -- that is the point.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from terrabyte_ai.predictor import ArtifactError, IrrigationPredictor

MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "irrigation_reg_v1.joblib"


@pytest.fixture(scope="module")
def predictor() -> IrrigationPredictor:
    return IrrigationPredictor.load(MODEL_PATH)


def request_payload(**overrides) -> dict:
    payload = {
        "soil_moisture_pct": 20.0,
        "soil_temperature_c": 21.0,
        "air_temperature_c": 25.0,
        "air_humidity_pct": 50.0,
        "plant_light_ppfd_umol_m2_s": 400.0,
        "hours_since_last_irrigation": 24.0,
        "substrate_volume_ml": 3000.0,
        "crop_code": "lettuce",
    }
    payload.update(overrides)
    return {key: value for key, value in payload.items() if value is not None}


def test_artifact_reports_its_version(predictor):
    assert predictor.model_version == "irrigation-reg-v1"
    assert predictor.metadata["input_schema_version"] == 1
    assert predictor.metadata["label_source"] == "synthetic-water-balance"


def test_missing_artifact_raises_rather_than_guessing(tmp_path):
    with pytest.raises(ArtifactError):
        IrrigationPredictor.load(tmp_path / "nope.joblib")


def test_prediction_shape(predictor):
    result = predictor.predict(request_payload())
    assert isinstance(result.volume_ml, int)
    assert 0.0 <= result.confidence <= 1.0
    assert result.imputed == ()
    assert result.latency_ms >= 0.0


def test_drier_soil_gets_more_water(predictor):
    """The single sanity check a reviewer would run by hand."""

    dry = predictor.predict(request_payload(soil_moisture_pct=12.0)).volume_ml
    wet = predictor.predict(request_payload(soil_moisture_pct=38.0)).volume_ml
    assert dry > wet


def test_bigger_pot_gets_more_water(predictor):
    small = predictor.predict(request_payload(substrate_volume_ml=800.0)).volume_ml
    large = predictor.predict(request_payload(substrate_volume_ml=5000.0)).volume_ml
    assert large > small


def test_imputed_fields_are_reported(predictor):
    result = predictor.predict(request_payload(soil_temperature_c=None))
    assert "soil_temperature_c" in result.imputed


def test_unknown_crop_lowers_confidence(predictor):
    known = predictor.predict(request_payload(crop_code="lettuce"))
    unknown = predictor.predict(request_payload(crop_code="dragonfruit"))
    assert unknown.confidence <= known.confidence


def test_out_of_distribution_input_lowers_confidence(predictor):
    """A pot far larger than anything trained on must not answer confidently."""

    normal = predictor.predict(request_payload(substrate_volume_ml=3000.0))
    extreme = predictor.predict(request_payload(substrate_volume_ml=19000.0))
    assert extreme.confidence <= 0.3
    assert extreme.confidence <= normal.confidence


def test_predictions_stay_within_the_backend_hard_ceiling(predictor):
    """Not a clamp -- the model simply should not want more than 500 mL. If this
    starts failing, the backend will be falling back instead of using the model."""

    extreme = predictor.predict(
        request_payload(
            soil_moisture_pct=2.0,
            substrate_volume_ml=20000.0,
            air_temperature_c=42.0,
            air_humidity_pct=8.0,
            plant_light_ppfd_umol_m2_s=1400.0,
            hours_since_last_irrigation=300.0,
        )
    )
    assert 0 <= extreme.volume_ml <= 500


def test_prediction_fits_the_latency_budget(predictor):
    """The backend times out at 800 ms including the network."""

    assert predictor.predict(request_payload()).latency_ms < 100.0
