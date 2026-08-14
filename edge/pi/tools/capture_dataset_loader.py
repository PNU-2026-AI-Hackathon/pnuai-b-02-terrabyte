"""Turn a bench capture CSV into a supervised irrigation dataset.

The capture is a sensor trace plus the operator's own watering events. The label
is derived from those events: *did a human water this pot within the next
``LABEL_HORIZON_HOURS``?* That makes the target a record of a real decision
rather than a restatement of a formula, which is the main reason to collect a
capture at all.

Two properties of the capture drive the choices here:

* **Rows are one minute apart and heavily autocorrelated.** Consecutive rows are
  nearly identical, so they are decimated before use, and the train/test split
  is chronological. A random split would put a row's own neighbours on the other
  side of the split and report an accuracy that cannot survive deployment.
* **PPFD is empty.** The logger ships with lux to PPFD conversion disabled
  (§8-1), so PPFD is derived here with a placeholder coefficient. Replace
  :data:`PPFD_PER_LUX` once the calibration is settled.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


# Hours ahead in which an irrigation event marks the current row positive.
LABEL_HORIZON_HOURS = 6.0

# Placeholder white-LED conversion. NOT calibrated; see docs/todolist.md §8-1.
PPFD_PER_LUX = 0.0185

# Validity bits emitted by the dataset logger.
SOIL_TEMPERATURE_VALID = 8
SOIL_MOISTURE_VALID = 16

_MAX_HOURS_SINCE = 720.0


class CaptureError(ValueError):
    """Raised when a capture file is unusable."""


@dataclass(frozen=True)
class Capture:
    rows: list[list[float]]
    labels: list[int]
    timestamps: list[datetime]
    dropped: int
    irrigation_events: int
    synthetic: bool


def _parse_timestamp(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _optional_float(text: str) -> float | None:
    text = text.strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def load_capture(path: Path, *, decimate_minutes: int = 10) -> Capture:
    """Read one capture file into feature rows and labels."""

    if decimate_minutes < 1:
        raise CaptureError("decimate_minutes must be at least 1")

    synthetic = False
    header: list[str] | None = None
    records: list[dict[str, str]] = []

    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            if "SYNTHETIC" in line:
                synthetic = True
            continue
        if not line.strip():
            continue
        fields = line.split(",")
        if header is None:
            header = [name.strip() for name in fields]
            continue
        if len(fields) != len(header):
            continue
        records.append(dict(zip(header, fields)))

    if header is None or not records:
        raise CaptureError(f"{path} contains no data rows")
    for required in ("captured_at_utc", "soil_moisture_pct", "event", "validity"):
        if required not in header:
            raise CaptureError(f"{path} is missing the {required!r} column")

    # Irrigation times first: the label for a row depends on the future.
    irrigation_times: list[datetime] = [
        _parse_timestamp(record["captured_at_utc"])
        for record in records
        if record.get("event", "").strip() == "irrigation"
    ]
    if not irrigation_times:
        raise CaptureError(
            f"{path} records no irrigation events, so no labels can be derived"
        )

    rows: list[list[float]] = []
    labels: list[int] = []
    timestamps: list[datetime] = []
    dropped = 0
    next_irrigation = 0
    previous_irrigation: datetime | None = None

    for index, record in enumerate(records):
        stamp = _parse_timestamp(record["captured_at_utc"])

        while (
            next_irrigation < len(irrigation_times)
            and irrigation_times[next_irrigation] < stamp
        ):
            previous_irrigation = irrigation_times[next_irrigation]
            next_irrigation += 1

        if index % decimate_minutes != 0:
            continue

        try:
            validity = int(record["validity"])
        except ValueError:
            dropped += 1
            continue

        soil_moisture = _optional_float(record["soil_moisture_pct"])
        soil_temperature = _optional_float(record.get("soil_temperature_c", ""))
        air_temperature = _optional_float(record.get("air_temperature_c", ""))
        humidity = _optional_float(record.get("relative_humidity_pct", ""))
        lux = _optional_float(record.get("illuminance_lux", ""))
        ppfd = _optional_float(record.get("ppfd_umol_m2_s", ""))

        if not validity & SOIL_MOISTURE_VALID or soil_moisture is None:
            dropped += 1
            continue
        if not validity & SOIL_TEMPERATURE_VALID or soil_temperature is None:
            dropped += 1
            continue
        if air_temperature is None or humidity is None:
            dropped += 1
            continue

        if ppfd is None:
            if lux is None:
                dropped += 1
                continue
            ppfd = lux * PPFD_PER_LUX

        if previous_irrigation is None:
            # Nothing to measure from before the first watering.
            dropped += 1
            continue
        hours_since = (stamp - previous_irrigation).total_seconds() / 3600.0
        hours_since = min(hours_since, _MAX_HOURS_SINCE)

        watered_soon = any(
            0.0 <= (event - stamp).total_seconds() / 3600.0 <= LABEL_HORIZON_HOURS
            for event in irrigation_times[next_irrigation:next_irrigation + 4]
        )

        rows.append(
            [
                soil_moisture,
                soil_temperature,
                air_temperature,
                humidity,
                min(ppfd, 5000.0),
                hours_since,
            ]
        )
        labels.append(1 if watered_soon else 0)
        timestamps.append(stamp)

    if not rows:
        raise CaptureError(f"{path} yielded no usable rows")

    return Capture(
        rows=rows,
        labels=labels,
        timestamps=timestamps,
        dropped=dropped,
        irrigation_events=len(irrigation_times),
        synthetic=synthetic,
    )


def load_captures(paths: list[Path], *, decimate_minutes: int = 10) -> Capture:
    """Concatenate several captures, preserving each file's own ordering."""

    merged = Capture([], [], [], 0, 0, False)
    for path in sorted(paths):
        capture = load_capture(path, decimate_minutes=decimate_minutes)
        merged = Capture(
            rows=merged.rows + capture.rows,
            labels=merged.labels + capture.labels,
            timestamps=merged.timestamps + capture.timestamps,
            dropped=merged.dropped + capture.dropped,
            irrigation_events=merged.irrigation_events + capture.irrigation_events,
            synthetic=merged.synthetic or capture.synthetic,
        )
    return merged
