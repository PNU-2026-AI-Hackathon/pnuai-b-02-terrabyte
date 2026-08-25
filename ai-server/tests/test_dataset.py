"""The generator is committed instead of the data, so it must be reproducible."""

from __future__ import annotations

import numpy as np

from terrabyte_ai.dataset import generate
from terrabyte_ai.features import FEATURE_NAMES, FEATURE_RANGES


def test_same_seed_reproduces_the_same_dataset():
    """This is what makes committing the generator instead of the CSV safe (D25)."""

    first = generate(800, seed=7)
    second = generate(800, seed=7)

    assert np.array_equal(first.session_ids, second.session_ids)
    assert np.allclose(first.volume_ml, second.volume_ml)
    for name in FEATURE_NAMES:
        if name == "crop_code":
            assert np.array_equal(first.features[name], second.features[name])
        else:
            assert np.allclose(first.features[name], second.features[name])


def test_different_seeds_produce_different_data():
    assert not np.allclose(
        generate(800, seed=7).volume_ml, generate(800, seed=8).volume_ml
    )


def test_requested_row_count_is_exact():
    assert len(generate(1234, seed=1)) == 1234


def test_every_generated_value_passes_the_feature_contract():
    """A generator that emits out-of-range values trains a model on states the
    server would reject at request time."""

    data = generate(2000, seed=3)
    for name, (low, high) in FEATURE_RANGES.items():
        values = data.features[name]
        assert values.min() >= low, f"{name} 하한 위반"
        assert values.max() <= high, f"{name} 상한 위반"


def test_sessions_contain_many_rows_each():
    """Rows must be groupable; one row per session would make the group split
    identical to a row split and reintroduce the leak it exists to prevent."""

    data = generate(2000, seed=3)
    sessions = len(set(data.session_ids.tolist()))
    assert sessions > 1
    assert len(data) / sessions > 5


def test_dry_pots_are_represented():
    """The edge emergency rule fires at 15 % moisture. If the generator never
    goes there, the server has never seen the state it most needs to handle."""

    data = generate(4000, seed=5)
    assert data.features["soil_moisture_pct"].min() < 15.0


def test_labels_span_the_fallback_table_range():
    data = generate(4000, seed=5)
    volumes = data.volume_ml
    assert volumes.min() >= 0.0
    assert 40.0 < np.median(volumes) < 250.0
