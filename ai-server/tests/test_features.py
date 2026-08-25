"""The feature contract: what is rejected, what is substituted, what order."""

from __future__ import annotations

import pytest

from terrabyte_ai.features import (
    DEFAULTS,
    FEATURE_NAMES,
    FeatureError,
    FeatureVector,
)


def valid_payload(**overrides) -> dict:
    payload = {
        "soil_moisture_pct": 18.0,
        "soil_temperature_c": 21.5,
        "air_temperature_c": 27.0,
        "air_humidity_pct": 45.0,
        "plant_light_ppfd_umol_m2_s": 520.0,
        "hours_since_last_irrigation": 30.0,
        "substrate_volume_ml": 3000.0,
        "crop_code": "cherry_tomato",
    }
    payload.update(overrides)
    return {key: value for key, value in payload.items() if value is not None}


def test_row_follows_declared_feature_order():
    """The artifact's columns are positional; a reorder here corrupts serving."""

    vector = FeatureVector.from_mapping(valid_payload())
    assert len(vector.values) == len(FEATURE_NAMES)
    assert vector.values[FEATURE_NAMES.index("soil_moisture_pct")] == 18.0
    assert vector.values[FEATURE_NAMES.index("crop_code")] == "cherry_tomato"
    assert vector.imputed == ()


@pytest.mark.parametrize(
    "missing", ["soil_moisture_pct", "air_temperature_c", "air_humidity_pct"]
)
def test_required_features_are_rejected_when_missing(missing):
    with pytest.raises(FeatureError) as caught:
        FeatureVector.from_mapping(valid_payload(**{missing: None}))
    assert any(missing in detail for detail in caught.value.details)


@pytest.mark.parametrize(
    ("name", "default"),
    [
        ("soil_temperature_c", DEFAULTS["soil_temperature_c"]),
        ("plant_light_ppfd_umol_m2_s", DEFAULTS["plant_light_ppfd_umol_m2_s"]),
        ("hours_since_last_irrigation", DEFAULTS["hours_since_last_irrigation"]),
        ("substrate_volume_ml", DEFAULTS["substrate_volume_ml"]),
    ],
)
def test_optional_features_are_imputed_and_reported(name, default):
    vector = FeatureVector.from_mapping(valid_payload(**{name: None}))
    assert name in vector.imputed
    assert vector.values[FEATURE_NAMES.index(name)] == default


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("soil_moisture_pct", -5.0),
        ("soil_moisture_pct", 150.0),
        ("air_humidity_pct", 101.0),
        ("substrate_volume_ml", 50.0),
        ("hours_since_last_irrigation", 400.0),
    ],
)
def test_out_of_range_values_are_rejected(name, value):
    with pytest.raises(FeatureError):
        FeatureVector.from_mapping(valid_payload(**{name: value}))


def test_all_offending_fields_are_reported_at_once():
    """One round trip should be enough to learn everything that is wrong."""

    with pytest.raises(FeatureError) as caught:
        FeatureVector.from_mapping(
            valid_payload(soil_moisture_pct=None, air_humidity_pct=999.0)
        )
    assert len(caught.value.details) == 2


def test_unknown_crop_is_accepted_not_rejected():
    """Adding a crop to the backend must not take the AI server down."""

    vector = FeatureVector.from_mapping(valid_payload(crop_code="dragonfruit"))
    assert vector.values[FEATURE_NAMES.index("crop_code")] == "dragonfruit"


def test_missing_crop_falls_back_to_unknown():
    vector = FeatureVector.from_mapping(valid_payload(crop_code=None))
    assert vector.values[FEATURE_NAMES.index("crop_code")] == DEFAULTS["crop_code"]
    assert "crop_code" in vector.imputed


def test_non_numeric_value_is_rejected():
    with pytest.raises(FeatureError):
        FeatureVector.from_mapping(valid_payload(soil_moisture_pct="촉촉함"))


def test_nan_is_rejected():
    with pytest.raises(FeatureError):
        FeatureVector.from_mapping(valid_payload(soil_moisture_pct=float("nan")))
