"""Feature contract shared by training and serving.

Both ``tools/train_irrigation_regressor.py`` and the FastAPI app import this
module. That is the whole point: if the training script and the server each
built their own feature vector, a reordered column or a different default would
silently produce wrong irrigation volumes with no error anywhere. One module,
one order, one set of defaults.

The contract itself lives in ``docs/design/ml_irrigation_contract.md`` §1.
"""

from __future__ import annotations

from dataclasses import dataclass

INPUT_SCHEMA_VERSION = 1

# Column order is part of the artifact contract. Never reorder without bumping
# INPUT_SCHEMA_VERSION -- an old model loaded against a new order would keep
# answering, just wrongly.
NUMERIC_FEATURES: tuple[str, ...] = (
    "soil_moisture_pct",
    "soil_temperature_c",
    "air_temperature_c",
    "air_humidity_pct",
    "plant_light_ppfd_umol_m2_s",
    "hours_since_last_irrigation",
    "substrate_volume_ml",
)
CATEGORICAL_FEATURES: tuple[str, ...] = ("crop_code",)
FEATURE_NAMES: tuple[str, ...] = NUMERIC_FEATURES + CATEGORICAL_FEATURES

# Accepted ranges. Values outside these are a caller bug, not a plant state, so
# they are rejected rather than clipped.
FEATURE_RANGES: dict[str, tuple[float, float]] = {
    "soil_moisture_pct": (0.0, 100.0),
    "soil_temperature_c": (-20.0, 80.0),
    "air_temperature_c": (-50.0, 100.0),
    "air_humidity_pct": (0.0, 100.0),
    "plant_light_ppfd_umol_m2_s": (0.0, 5000.0),
    "hours_since_last_irrigation": (0.0, 336.0),
    "substrate_volume_ml": (100.0, 20000.0),
}

# Features whose absence makes the prediction meaningless. Everything else has
# a defensible default.
REQUIRED_FEATURES: frozenset[str] = frozenset(
    {"soil_moisture_pct", "air_temperature_c", "air_humidity_pct"}
)

# Substituted when a value is missing. Each choice is a deliberate bias toward
# under-watering, because over-watering cannot be undone.
DEFAULTS: dict[str, float | str] = {
    # Soil temperature is not collected yet (envelope v2, P1-6). Room temperature
    # keeps the root-uptake term neutral instead of inventing stress.
    "soil_temperature_c": 20.0,
    # No light reading -> assume night, which lowers evapotranspiration and so
    # lowers the recommended volume.
    "plant_light_ppfd_umol_m2_s": 0.0,
    # No irrigation history -> assume a long gap. This raises the volume, but the
    # soil moisture reading dominates and the Governor's cooldown gate is the
    # real protection against double-watering.
    "hours_since_last_irrigation": 72.0,
    # 1 L: the smallest pot in the fallback table, so a missing volume never
    # inflates the dose.
    "substrate_volume_ml": 1000.0,
    "crop_code": "unknown",
}

UNKNOWN_CROP = "unknown"

# Crop codes seeded in V6__create_crop_and_add_device_crop.sql. Unlisted codes
# are NOT rejected -- adding a crop to the backend must not turn the AI server
# into an outage. They fall back to `unknown` and lose confidence instead.
KNOWN_CROP_CODES: tuple[str, ...] = (
    "cherry_tomato",
    "lettuce",
    "basil",
    "peppermint",
    "welsh_onion",
    "arugula",
    "wasabi",
    "coriander",
    UNKNOWN_CROP,
)


class FeatureError(ValueError):
    """A request cannot be turned into a feature vector.

    ``details`` carries one message per offending field so the API can return
    all of them at once instead of making the caller fix errors one at a time.
    """

    def __init__(self, details: list[str]) -> None:
        super().__init__("; ".join(details))
        self.details = details


@dataclass(frozen=True)
class FeatureVector:
    """One row, in FEATURE_NAMES order, plus which fields were substituted."""

    values: tuple[float | str, ...]
    imputed: tuple[str, ...]

    @classmethod
    def from_mapping(cls, payload: dict) -> "FeatureVector":
        details: list[str] = []
        imputed: list[str] = []
        resolved: dict[str, float | str] = {}

        for name in NUMERIC_FEATURES:
            raw = payload.get(name)
            if raw is None:
                if name in REQUIRED_FEATURES:
                    details.append(f"{name}: 필수 값이 없습니다")
                    continue
                resolved[name] = float(DEFAULTS[name])
                imputed.append(name)
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                details.append(f"{name}: 숫자가 아닙니다 ({raw!r})")
                continue
            if value != value:  # NaN
                details.append(f"{name}: NaN은 허용되지 않습니다")
                continue
            low, high = FEATURE_RANGES[name]
            if not low <= value <= high:
                details.append(f"{name}: {low}~{high} 범위를 벗어났습니다 ({value})")
                continue
            resolved[name] = value

        crop = payload.get("crop_code")
        if crop is None or crop == "":
            resolved["crop_code"] = UNKNOWN_CROP
            imputed.append("crop_code")
        else:
            resolved["crop_code"] = str(crop)

        if details:
            raise FeatureError(details)

        return cls(
            values=tuple(resolved[name] for name in FEATURE_NAMES),
            imputed=tuple(imputed),
        )

    def as_row(self) -> list[float | str]:
        return list(self.values)
