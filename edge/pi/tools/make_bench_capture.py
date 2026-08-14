"""Generate a FABRICATED bench capture in the dataset logger's CSV format.

This does not collect anything. It writes a file that is shaped exactly like a
real ``capture_dataset.py`` run so the downstream tooling can be built and
tested before a pot has actually been instrumented.

    python tools/make_bench_capture.py --days 45 --output data/raw/pot-01.csv

The output lands in ``data/`` which is git-ignored, and every generated file
carries a ``# SYNTHETIC`` banner in its first line. Both are deliberate: nothing
here is measurement data, and it must not be reported as though it were.

Replace it with a real capture as soon as one exists. See the module docstring
in ``train_irrigation_rf.py`` for why a model trained on generated data is only
trusted inside the deterministic envelope.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
from pathlib import Path
import random


# Must match the dataset_logger PlatformIO environment.
DRY_ADC = 620
WET_ADC = 280
INTERVAL_SECONDS = 60
NODE_ID = "bench-dataset-01"

HEADER_COLUMNS = (
    "captured_at_utc,sequence,uptime_ms,air_temperature_c,relative_humidity_pct,"
    "ppfd_umol_m2_s,illuminance_lux,soil_temperature_c,soil_moisture_pct,"
    "soil_moisture_raw_adc,validity,event,event_ml"
)

# air_t | rh | soil_t | lux — PPFD stays invalid because the logger ships with
# lux to PPFD conversion disabled.
VALIDITY_ALL = 1 | 2 | 8 | 16 | 32


def diurnal(hour: float, peak_hour: float) -> float:
    """Smooth 0..1 daily cycle peaking at ``peak_hour``."""

    return 0.5 * (1.0 + math.cos((hour - peak_hour) * math.pi / 12.0))


def moisture_to_adc(moisture_pct: float) -> int:
    return int(round(DRY_ADC + (WET_ADC - DRY_ADC) * moisture_pct / 100.0))


@dataclass(frozen=True)
class PotProfile:
    """What makes one bench pot behave unlike the next.

    Training on a single pot teaches the model one substrate and one person's
    habits. Varying these is what stops the forest from memorising a single
    routine, so each generated pot gets its own draw.
    """

    name: str
    seed: int
    # Litres of substrate, as a multiplier on the drying rate. Small pots dry fast.
    drying_scale: float
    # Percentage points of moisture gained per millilitre poured.
    absorption_per_ml: float
    # Soil moisture at which the operator starts thinking about watering.
    thirst_threshold: float
    # Chance per minute of actually getting up to do it once they have noticed.
    diligence: float
    awake_from: float
    awake_until: float
    lights_on: float
    lights_off: float
    doses: tuple[int, ...]


def pot_profiles(count: int, seed: int) -> list[PotProfile]:
    rng = random.Random(seed)
    profiles = []
    for index in range(count):
        profiles.append(
            PotProfile(
                name=f"pot-{index + 1:02d}",
                seed=seed + index * 7919,
                drying_scale=rng.uniform(0.65, 1.45),
                absorption_per_ml=rng.uniform(0.28, 0.55),
                thirst_threshold=rng.uniform(18.0, 28.0),
                diligence=rng.uniform(0.02, 0.09),
                awake_from=rng.uniform(7.0, 9.5),
                awake_until=rng.uniform(21.0, 23.5),
                lights_on=rng.uniform(5.0, 7.5),
                lights_off=rng.uniform(20.0, 22.5),
                doses=rng.choice(((30, 30, 30, 40), (30, 40, 50), (30, 30, 50, 60))),
            )
        )
    return profiles


def generate(days: int, seed: int, profile: PotProfile | None = None) -> list[str]:
    profile = profile or PotProfile(
        name="pot-01",
        seed=seed,
        drying_scale=1.0,
        absorption_per_ml=0.40,
        thirst_threshold=22.0,
        diligence=0.05,
        awake_from=8.0,
        awake_until=23.0,
        lights_on=6.0,
        lights_off=22.0,
        doses=(30, 30, 30, 40, 50),
    )
    rng = random.Random(profile.seed)
    start = datetime.now(timezone.utc).replace(
        minute=0, second=0, microsecond=0
    ) - timedelta(days=days)

    rows: list[str] = []
    steps = days * 24 * 60 // (INTERVAL_SECONDS // 60)

    soil_moisture = 48.0
    soil_temperature = 20.0
    hours_since_irrigation = 8.0
    uptime_ms = 4200
    # Water poured in is not visible to the probe immediately; it redistributes
    # through the substrate over roughly a quarter of an hour.
    unabsorbed = 0.0

    for step in range(steps):
        stamp = start + timedelta(seconds=step * INTERVAL_SECONDS)
        hour = stamp.hour + stamp.minute / 60.0
        day_fraction = diurnal(hour, peak_hour=14.0)

        # Grow lights run 06:00-22:00; outside that the room is dark.
        lit = profile.lights_on <= hour < profile.lights_off
        lux = (
            max(0.0, 14000.0 * day_fraction + rng.gauss(0.0, 900.0)) if lit
            else max(0.0, rng.gauss(3.0, 2.0))
        )
        air_temperature = 21.5 + 4.5 * day_fraction + rng.gauss(0.0, 0.35)
        humidity = min(
            96.0, max(18.0, 68.0 - 22.0 * day_fraction + rng.gauss(0.0, 2.2))
        )

        # Soil temperature lags air temperature and swings less.
        soil_temperature += 0.05 * (air_temperature - 1.2 - soil_temperature)
        soil_temperature += rng.gauss(0.0, 0.04)

        # Evapotranspiration for one interval, driven by light, warmth and dry air.
        vapour_deficit = max(0.05, 1.0 - humidity / 100.0)
        light_term = 0.25 + lux / 9000.0
        warmth = max(0.2, 1.0 + 0.05 * (air_temperature - 20.0))
        availability = min(1.2, max(0.25, soil_moisture / 40.0))
        loss_per_hour = (
            0.85 * profile.drying_scale
            * vapour_deficit * light_term * warmth * availability
        )
        soil_moisture -= loss_per_hour * (INTERVAL_SECONDS / 3600.0)

        absorbed = unabsorbed * 0.12
        unabsorbed -= absorbed
        soil_moisture = max(3.0, soil_moisture + absorbed + rng.gauss(0.0, 0.02))

        hours_since_irrigation += INTERVAL_SECONDS / 3600.0

        event = ""
        event_ml = ""
        # The operator waters when the pot looks dry, but only while awake, and
        # not always immediately. That hesitation is the signal worth learning.
        if (
            soil_moisture < profile.thirst_threshold
            and profile.awake_from <= hour < profile.awake_until
            and hours_since_irrigation > 6.0
            and rng.random() < profile.diligence
        ):
            volume = rng.choice(profile.doses)
            event = "irrigation"
            event_ml = str(volume)
            # A 30 mL dose lifts a small pot by roughly 12 percentage points,
            # but only once it has soaked in. The row emitted right now still
            # carries the dry reading that prompted the watering, which is
            # exactly the state a label should be attached to.
            unabsorbed += min(
                62.0 - soil_moisture, volume * profile.absorption_per_ml
            )
            hours_since_irrigation = 0.0

        validity = VALIDITY_ALL
        soil_field = f"{soil_moisture:.2f}"
        adc_field = str(moisture_to_adc(soil_moisture))
        soil_temperature_field = f"{soil_temperature:.2f}"

        # Occasional DS18B20 dropout, as the real probe does on a long bus.
        if rng.random() < 0.004:
            validity &= ~8
            soil_temperature_field = ""
        # Rare capacitive sensor glitch.
        if rng.random() < 0.002:
            validity &= ~16
            soil_field = ""

        uptime_ms += INTERVAL_SECONDS * 1000 + rng.randint(-3, 3)
        rows.append(
            f"{stamp.isoformat(timespec='seconds').replace('+00:00', 'Z')},"
            f"{step},{uptime_ms},"
            f"{air_temperature:.2f},{humidity:.2f},,"
            f"{lux:.2f},{soil_temperature_field},{soil_field},"
            f"{adc_field},{validity},{event},{event_ml}"
        )

    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=45)
    parser.add_argument("--seed", type=int, default=20260814)
    parser.add_argument("--pots", type=int, default=4)
    parser.add_argument(
        "--output-dir", type=Path, default=Path("data/raw")
    )
    arguments = parser.parse_args()

    total_rows = 0
    total_events = 0
    for profile in pot_profiles(arguments.pots, arguments.seed):
        rows = generate(arguments.days, arguments.seed, profile)
        events = write_capture(arguments, profile, rows)
        total_rows += len(rows)
        total_events += events
    print(
        f"\ntotal: {arguments.pots} pots, {total_rows} rows, "
        f"{total_events} irrigation events"
    )


def write_capture(arguments, profile: "PotProfile", rows: list[str]) -> int:
    irrigations = sum(1 for row in rows if ",irrigation," in row)
    output = arguments.output_dir / f"{profile.name}-bench.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as sink:
        sink.write(
            "# SYNTHETIC — generated by tools/make_bench_capture.py, "
            "NOT measured. Do not report as collected data.\n"
        )
        sink.write(
            f"# terrabyte dataset logger, NOT production firmware; node={profile.name}"
            " logger=dataset-logger-0.1.0-BENCH-ONLY"
            f" interval_ms={INTERVAL_SECONDS * 1000}\n"
        )
        sink.write(
            "# validity bits: 1=air_t 2=rh 4=ppfd 8=soil_t 16=soil_moist 32=lux\n"
        )
        sink.write(
            f"# generator_seed={profile.seed} days={arguments.days}"
            f" drying_scale={profile.drying_scale:.3f}"
            f" absorption_per_ml={profile.absorption_per_ml:.3f}"
            f" thirst_threshold={profile.thirst_threshold:.1f}\n"
        )
        sink.write(HEADER_COLUMNS + "\n")
        sink.write("\n".join(rows) + "\n")

    size_kb = output.stat().st_size / 1024
    print(
        f"wrote {output} ({len(rows)} rows, {irrigations} irrigation "
        f"events, {size_kb:.0f} KiB)"
    )
    return irrigations


if __name__ == "__main__":
    main()
