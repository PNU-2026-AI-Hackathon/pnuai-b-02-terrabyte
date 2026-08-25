"""The label formula must behave like water, not like an arbitrary function.

These are the sanity checks that would catch a sign flip or a unit error in the
generator -- the kind of bug that produces a perfectly trainable model which
recommends the opposite of what the plant needs.
"""

from __future__ import annotations

import numpy as np

from terrabyte_ai.water_balance import (
    MAX_LABEL_ML,
    evapotranspiration_pct_per_hour,
    irrigation_volume_ml,
    redistribution_pct,
    wetted_fraction,
)


def volumes(**overrides) -> np.ndarray:
    base = {
        "soil_moisture_pct": np.array([25.0]),
        "soil_temperature_c": np.array([21.0]),
        "air_temperature_c": np.array([24.0]),
        "relative_humidity_pct": np.array([50.0]),
        "ppfd_umol_m2_s": np.array([400.0]),
        "hours_since_last_irrigation": np.array([24.0]),
        "substrate_volume_ml": np.array([3000.0]),
        "crop_codes": np.array(["lettuce"]),
    }
    base.update({key: np.array([value]) if not isinstance(value, np.ndarray) else value
                 for key, value in overrides.items()})
    return irrigation_volume_ml(**base)


def test_drier_soil_needs_more_water():
    assert volumes(soil_moisture_pct=15.0) > volumes(soil_moisture_pct=30.0)


def test_bigger_pot_needs_more_water():
    assert volumes(substrate_volume_ml=6000.0) > volumes(substrate_volume_ml=1000.0)


def test_hotter_drier_air_needs_more_water():
    hot = volumes(air_temperature_c=32.0, relative_humidity_pct=25.0)
    mild = volumes(air_temperature_c=20.0, relative_humidity_pct=75.0)
    assert hot > mild


def test_recently_watered_pot_needs_less():
    """The redistribution term is what stops back-to-back watering."""

    assert volumes(hours_since_last_irrigation=0.5) < volumes(
        hours_since_last_irrigation=48.0
    )


def test_saturated_soil_needs_nothing_beyond_the_lookahead():
    """Above target the deficit term is zero, so only evaporation is topped up."""

    dark_and_cold = volumes(
        soil_moisture_pct=80.0, ppfd_umol_m2_s=0.0, air_temperature_c=10.0,
        relative_humidity_pct=95.0,
    )
    assert dark_and_cold < 20.0


def test_label_never_exceeds_the_backend_hard_ceiling():
    """A label above 500 mL would teach the model to emit values that always
    trigger the backend's fallback path."""

    extreme = volumes(
        soil_moisture_pct=0.0,
        substrate_volume_ml=20000.0,
        air_temperature_c=45.0,
        relative_humidity_pct=5.0,
        ppfd_umol_m2_s=5000.0,
        hours_since_last_irrigation=300.0,
    )
    assert extreme <= MAX_LABEL_ML


def test_label_is_never_negative():
    assert volumes(soil_moisture_pct=100.0) >= 0.0


def test_wasabi_wants_more_than_welsh_onion():
    """Per-crop targets must actually reach the label."""

    wet = volumes(crop_codes=np.array(["wasabi"]))
    dry = volumes(crop_codes=np.array(["welsh_onion"]))
    assert wet > dry


def test_unknown_crop_uses_the_default_target():
    assert volumes(crop_codes=np.array(["dragonfruit"])) > 0.0


def test_wetted_fraction_shrinks_with_pot_size():
    """A single dose wets the root zone; that share falls as pots grow."""

    sizes = np.array([500.0, 2000.0, 6000.0, 12000.0])
    fractions = wetted_fraction(sizes)
    assert np.all(np.diff(fractions) <= 0)
    assert fractions[0] == 1.0  # small pots are wetted through


def test_evapotranspiration_rises_with_light_and_heat():
    def rate(temp, ppfd):
        return evapotranspiration_pct_per_hour(
            np.array([35.0]), np.array([21.0]), np.array([temp]),
            np.array([50.0]), np.array([ppfd]),
        )

    assert rate(30.0, 900.0) > rate(18.0, 0.0)


def test_redistribution_decays_to_nothing():
    assert redistribution_pct(np.array([0.0]))[0] > 1.0
    assert redistribution_pct(np.array([48.0]))[0] < 0.01
