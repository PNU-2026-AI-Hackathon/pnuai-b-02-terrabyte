"""Synthetic dataset generation.

Rows are not drawn independently. Each *session* is one simulated pot -- fixed
crop, fixed substrate volume, its own climate -- stepped forward hour by hour,
watered when it dries out. Neighbouring hours of the same pot are strongly
correlated, so a plain row-wise train/test split would leak. The ``session_id``
column exists so the trainer can split by group instead.

Only the generator and its seed are committed; the CSV is not (D25).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .features import FEATURE_NAMES, KNOWN_CROP_CODES, UNKNOWN_CROP
from .water_balance import (
    IRRIGATION_EFFICIENCY,
    WATER_HOLDING_FRACTION,
    evapotranspiration_pct_per_hour,
    irrigation_volume_ml,
    target_moisture_pct,
    wetted_fraction,
)

COLUMNS: tuple[str, ...] = ("session_id",) + FEATURE_NAMES + ("volume_ml",)

# Hours simulated per pot. Ten days covers several dry/water cycles, so a
# session contains both freshly-watered and stressed states.
SESSION_HOURS = 240

# Substrate volumes in the fallback table's bands, so the model sees the same
# pot sizes the backend reasons about.
VOLUME_BANDS_ML: tuple[tuple[float, float], ...] = (
    (300.0, 1000.0),
    (1000.0, 3000.0),
    (3000.0, 6000.0),
    (6000.0, 12000.0),
)

# The rule engine only asks "how much" once it has decided water is needed, so
# rows well above the crop target are not the operating regime. A few are kept
# anyway (KEEP_WET_SHARE) so the model does not extrapolate wildly if it is ever
# called on a wet pot.
WET_MARGIN_PCT = 5.0
KEEP_WET_SHARE = 0.10

# Multiplicative label noise. Without it the model memorises a noiseless
# boundary and every metric becomes a measure of nothing.
LABEL_NOISE_SIGMA = 0.10

# Simulated operators are not uniform. If every pot were watered the instant it
# dipped below its target, soil moisture would never fall below ~23 % and the
# model would never see a dry pot -- while the edge emergency rule fires at 15 %.
# Per session: how dry it gets before anyone notices, and how likely they are to
# act in any given hour once it is dry.
TRIGGER_DEFICIT_PCT = (5.0, 20.0)
RESPONSE_PROBABILITY = (0.08, 1.0)


@dataclass(frozen=True)
class Dataset:
    session_ids: np.ndarray
    features: dict[str, np.ndarray]
    volume_ml: np.ndarray

    def __len__(self) -> int:
        return len(self.session_ids)

    def to_rows(self) -> list[list]:
        return [
            [self.session_ids[i]]
            + [self.features[name][i] for name in FEATURE_NAMES]
            + [self.volume_ml[i]]
            for i in range(len(self))
        ]


def _diurnal_ppfd(
    hour_of_day: np.ndarray, peak: np.ndarray, photoperiod: np.ndarray
) -> np.ndarray:
    """Indoor light: a half-sine over the photoperiod, near-dark outside it."""

    start = 12.0 - photoperiod / 2.0
    phase = (hour_of_day - start) / photoperiod
    lit = (phase >= 0.0) & (phase <= 1.0)
    return np.where(lit, peak * np.sin(np.pi * np.clip(phase, 0.0, 1.0)), 0.0)


def generate(samples: int, seed: int) -> Dataset:
    """Simulate pots until ``samples`` rows in the operating regime are kept."""

    rng = np.random.default_rng(seed)
    crops = np.array([c for c in KNOWN_CROP_CODES if c != UNKNOWN_CROP])

    collected: list[dict[str, np.ndarray]] = []
    kept = 0
    next_session = 0
    # Sessions are simulated in blocks so the whole run stays vectorised. Roughly
    # a third of simulated hours survive the wet-row filter, hence the /80.
    block = max(64, samples // 80)

    while kept < samples:
        n = block
        session_ids = np.arange(next_session, next_session + n)
        next_session += n

        crop = rng.choice(crops, size=n)
        band = rng.integers(0, len(VOLUME_BANDS_ML), size=n)
        low = np.array([VOLUME_BANDS_ML[b][0] for b in band])
        high = np.array([VOLUME_BANDS_ML[b][1] for b in band])
        volume = rng.uniform(low, high)
        # Same capacity the label formula uses: a dose rewets the root zone, and
        # the probe sits in it.
        capacity = volume * WATER_HOLDING_FRACTION * wetted_fraction(volume)
        target = target_moisture_pct(crop)

        trigger = target - rng.uniform(*TRIGGER_DEFICIT_PCT, size=n)
        response = rng.uniform(*RESPONSE_PROBABILITY, size=n)

        # Per-pot climate. Indoor, but a windowsill and a basement differ.
        base_air_temp = np.clip(rng.normal(23.0, 4.0, n), 8.0, 38.0)
        base_humidity = np.clip(rng.normal(55.0, 15.0, n), 15.0, 95.0)
        peak_ppfd = np.clip(rng.normal(450.0, 200.0, n), 30.0, 1400.0)
        photoperiod = rng.uniform(8.0, 16.0, n)
        # Soil lags air temperature and swings less.
        soil_offset = rng.normal(-1.5, 1.5, n)

        moisture = rng.uniform(target - 5.0, target + 8.0)
        hours_since = rng.uniform(0.0, 24.0, n)

        for hour in range(SESSION_HOURS):
            hour_of_day = float(hour % 24)
            air_temp = np.clip(
                base_air_temp + 3.5 * np.sin((hour_of_day - 9.0) / 24.0 * 2 * np.pi)
                + rng.normal(0.0, 0.6, n),
                -5.0,
                45.0,
            )
            humidity = np.clip(
                base_humidity - 8.0 * np.sin((hour_of_day - 9.0) / 24.0 * 2 * np.pi)
                + rng.normal(0.0, 2.5, n),
                5.0,
                100.0,
            )
            ppfd = np.clip(
                _diurnal_ppfd(np.full(n, hour_of_day), peak_ppfd, photoperiod)
                + rng.normal(0.0, 12.0, n),
                0.0,
                5000.0,
            )
            soil_temp = np.clip(air_temp + soil_offset, -20.0, 80.0)

            noise = np.clip(rng.normal(1.0, LABEL_NOISE_SIGMA, n), 0.5, 1.6)
            label = irrigation_volume_ml(
                moisture,
                soil_temp,
                air_temp,
                humidity,
                ppfd,
                hours_since,
                volume,
                crop,
                noise=noise,
            )

            # Keep the rows the rule engine would actually ask about, plus a
            # thin slice of wet ones for out-of-regime robustness.
            in_regime = moisture <= target + WET_MARGIN_PCT
            keep = in_regime | (rng.random(n) < KEEP_WET_SHARE)
            if keep.any():
                collected.append(
                    {
                        "session_id": session_ids[keep],
                        "soil_moisture_pct": moisture[keep],
                        "soil_temperature_c": soil_temp[keep],
                        "air_temperature_c": air_temp[keep],
                        "air_humidity_pct": humidity[keep],
                        "plant_light_ppfd_umol_m2_s": ppfd[keep],
                        "hours_since_last_irrigation": hours_since[keep],
                        "substrate_volume_ml": volume[keep],
                        "crop_code": crop[keep],
                        "volume_ml": label[keep],
                    }
                )
                kept += int(keep.sum())

            # Advance the pot one hour.
            rate = evapotranspiration_pct_per_hour(
                moisture, soil_temp, air_temp, humidity, ppfd
            )
            moisture = np.clip(moisture - rate, 0.0, 100.0)
            hours_since = np.minimum(hours_since + 1.0, 336.0)

            # The simulated operator notices at their own threshold and acts with
            # their own promptness, so pots reach a range of dryness.
            watered = (moisture < trigger) & (rng.random(n) < response)
            if watered.any():
                applied = label * IRRIGATION_EFFICIENCY / capacity * 100.0
                moisture = np.where(
                    watered, np.clip(moisture + applied, 0.0, 100.0), moisture
                )
                hours_since = np.where(watered, 0.0, hours_since)

            if kept >= samples:
                break

    merged = {
        key: np.concatenate([chunk[key] for chunk in collected])
        for key in collected[0]
    }
    # Trim to the requested size so a given (samples, seed) is reproducible.
    for key in merged:
        merged[key] = merged[key][:samples]

    return Dataset(
        session_ids=merged.pop("session_id"),
        volume_ml=merged.pop("volume_ml"),
        features=merged,
    )
