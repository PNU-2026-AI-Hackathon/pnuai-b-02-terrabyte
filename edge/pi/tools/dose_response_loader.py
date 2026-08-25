"""Load a dosing-campaign JSONL journal into one record per physical dose.

Usage: ``from dose_response_loader import load_dose_response_campaign``

This is a dose-wise physics loader, deliberately separate from the row-wise
``capture_dataset_loader``.  In particular:

* There is no ``LABEL_HORIZON_HOURS``/``watered_soon`` label.  That label
  describes an operator decision, while this campaign measures a physical
  response to a known dose.
* Telemetry is never index-decimated.  The samples immediately after a dose are
  the rising edge that was expensive to collect; dropping nine of ten would
  destroy the time-constant evidence.
* The untouched rows before the first watering are retained.  They are the
  drying-curve baseline, not disposable warm-up data.
* Measuring-cup observations identify delivered and runoff volumes.  Missing
  runoff is kept as unknown; only an explicit zero says the saucer was dry.
* Probe-derived evaporation fits are conditional on the exact dry/wet ADC
  endpoints, which are stored on every such result.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import json
import math
from pathlib import Path
import re
from typing import Any, Literal, Sequence

import numpy as np

from capture_dataset_loader import _optional_float, _parse_timestamp


MIN_EFFICIENCY_DOSES = 4
MIN_ET_INTERVALS = 6
MIN_PERSISTENT_RUNOFF_DOSES = 2
DEFAULT_MANUAL_MATCH_SECONDS = 30.0 * 60.0
DEFAULT_FLOW_ML_PER_S = 0.98
DRY_START_MAX_MOISTURE_PCT = 5.0
_SETTLED_TIME_CONSTANTS = -math.log(0.02)
_AVAILABILITY_MINIMUM = 0.25
_AVAILABILITY_MAXIMUM = 1.2
_PPFD_PER_LUX = 0.0185


class DoseResponseError(ValueError):
    """Raised when campaign input has no usable dose records."""


class CalibrationStatus(str, Enum):
    """Keep measured values visibly distinct from unmeasured assumptions."""

    CALIBRATED = "CALIBRATED"
    CONDITIONAL = "CONDITIONAL"
    UNCALIBRATED = "UNCALIBRATED"


@dataclass(frozen=True)
class FitEvidence:
    """The observations and method supporting (or refusing) one fit."""

    sample_count: int
    method: str
    started_at_utc: datetime | None = None
    ended_at_utc: datetime | None = None
    details: tuple[str, ...] = ()


@dataclass(frozen=True)
class CalibratedResult:
    """A value that the supplied campaign actually identified."""

    name: str
    value: Any
    unit: str
    evidence: FitEvidence
    status: CalibrationStatus = field(
        default=CalibrationStatus.CALIBRATED, init=False
    )


@dataclass(frozen=True)
class ConditionalResult:
    """A probe-derived value tied to explicit moisture calibration endpoints."""

    name: str
    value: Any
    unit: str
    evidence: FitEvidence
    soil_moisture_dry_adc: float
    soil_moisture_wet_adc: float
    status: CalibrationStatus = field(
        default=CalibrationStatus.CONDITIONAL, init=False
    )


@dataclass(frozen=True)
class UncalibratedResult:
    """A refusal with no ``value`` attribute to mistake for a calibration."""

    name: str
    reason: str
    evidence: FitEvidence
    status: CalibrationStatus = field(
        default=CalibrationStatus.UNCALIBRATED, init=False
    )


FitResult = CalibratedResult | ConditionalResult | UncalibratedResult


@dataclass
class TelemetrySample:
    """One intact board telemetry row and its reset-delimited session."""

    captured_at_utc: datetime
    session_id: str
    message_type: str
    soil_moisture_raw_adc: float | None
    soil_moisture_pct: float | None
    soil_temperature_c: float | None
    air_temperature_c: float | None
    relative_humidity_pct: float | None
    illuminance_lux: float | None
    ppfd_umol_m2_s: float | None


@dataclass(frozen=True)
class ManualMeasurement:
    """One valid row from the operator's measuring-cup TSV."""

    timestamp_utc: datetime
    kind: str
    value_ml: float
    note: str
    line_number: int


@dataclass(frozen=True)
class DoseResponseValues:
    """The fitted response to one dose."""

    rise_pp: float
    tau_seconds: float
    drying_rate_pp_per_hour: float
    settled_at_utc: datetime


@dataclass
class DoseRecord:
    """One terminal completed or aborted pump command."""

    session_id: str
    command_id: str
    dosed_at_utc: datetime
    dose_ml_commanded: float | None
    dose_ml_delivered: float | None
    dose_ml_measured: float | None
    delivered_source: Literal["measured", "flow_estimate"]
    runoff_ml: float | None
    absorbed_ml: float | None
    actual_runtime_ms: int
    pre_dose_soil_moisture_pct: float | None
    pre_dose_soil_moisture_raw_adc: float | None
    pre_dose_soil_temperature_c: float | None
    pre_dose_air_temperature_c: float | None
    pre_dose_relative_humidity_pct: float | None
    pre_dose_illuminance_lux: float | None
    rise_pp: float | None
    tau_seconds: float | None
    drying_rate_pp_per_hour: float | None
    excluded: bool
    exclusion_reason: str | None
    phase: str
    response_evidence: FitEvidence | None = None

    # Short aliases make it explicit that the required state fields are the
    # pre-dose readings without duplicating mutable values in the record.
    @property
    def soil_moisture_pct(self) -> float | None:
        return self.pre_dose_soil_moisture_pct

    @property
    def soil_moisture_raw_adc(self) -> float | None:
        return self.pre_dose_soil_moisture_raw_adc

    @property
    def soil_temperature_c(self) -> float | None:
        return self.pre_dose_soil_temperature_c

    @property
    def air_temperature_c(self) -> float | None:
        return self.pre_dose_air_temperature_c

    @property
    def relative_humidity_pct(self) -> float | None:
        return self.pre_dose_relative_humidity_pct

    @property
    def illuminance_lux(self) -> float | None:
        return self.pre_dose_illuminance_lux


@dataclass
class DoseResponseCampaign:
    """The dose records plus evidence that did not join to a dose."""

    records: list[DoseRecord]
    telemetry: list[TelemetrySample]
    manual_measurements: list[ManualMeasurement]
    unmatched_manual_measurements: list[ManualMeasurement]
    raw_board_lines: list[str]
    malformed_journal_lines: list[str]
    soil_moisture_dry_adc: float | None
    soil_moisture_wet_adc: float | None
    substrate_volume_ml: float | None = None
    flow_ml_per_s: float = DEFAULT_FLOW_ML_PER_S


@dataclass(frozen=True)
class AvailabilityTerm:
    """Fitted form of ``clip(moisture/reference, minimum, maximum)``."""

    reference_moisture_pct: float
    minimum_factor: float
    maximum_factor: float


@dataclass(frozen=True)
class EvapotranspirationCalibration:
    """The conditional scale constant and availability term fitted together."""

    constant: FitResult
    availability: FitResult


@dataclass(frozen=True)
class WaterBalanceCalibration:
    """All relevant constants, including structurally unidentifiable ones."""

    water_holding_fraction: FitResult
    irrigation_efficiency: FitResult
    evapotranspiration_constant: FitResult
    availability: FitResult
    roots: UncalibratedResult
    wetted_fraction: UncalibratedResult
    crop_target_moisture_pct: UncalibratedResult


@dataclass(frozen=True)
class _Command:
    command_id: str
    captured_at_utc: datetime
    session_id: str
    requested_ml: float | None


@dataclass(frozen=True)
class _TerminalAck:
    command_id: str
    captured_at_utc: datetime
    session_id: str
    phase: str
    actual_ms: int
    ml: float | None


def recompute_soil_moisture_pct(
    raw_adc: float,
    dry_adc: float,
    wet_adc: float,
    *,
    clip: bool = False,
) -> float:
    """Recompute moisture percent from the primary raw ADC measurement.

    The Arduino calibration is linear with the dry endpoint at zero percent and
    the wet endpoint at 100 percent.  Values are not clipped by default because
    excursions beyond an endpoint are useful calibration evidence.
    """

    if not all(math.isfinite(value) for value in (raw_adc, dry_adc, wet_adc)):
        raise ValueError("ADC values and endpoints must be finite")
    if dry_adc == wet_adc:
        raise ValueError("dry_adc and wet_adc must differ")
    value = (raw_adc - dry_adc) * 100.0 / (wet_adc - dry_adc)
    return min(100.0, max(0.0, value)) if clip else value


def _number(value: Any) -> float | None:
    parsed = _optional_float("" if value is None else str(value))
    if parsed is None or not math.isfinite(parsed):
        return None
    return parsed


def _nonnegative_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    return None


def _read_manifest(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    if not path.exists():
        raise DoseResponseError(f"campaign manifest does not exist: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DoseResponseError(f"campaign manifest is not valid JSON: {path}") from exc
    if not isinstance(value, dict):
        raise DoseResponseError(f"campaign manifest must contain a JSON object: {path}")
    return value


def _session_name(number: int) -> str:
    return f"session-{number:04d}"


def _read_manual_log(path: Path | None) -> list[ManualMeasurement]:
    if path is None:
        return []
    if not path.exists():
        raise DoseResponseError(f"manual volume log does not exist: {path}")

    measurements: list[ManualMeasurement] = []
    with path.open("r", encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source, delimiter="\t")
        required = {"timestamp_utc", "kind", "value_ml", "note"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise DoseResponseError(
                f"{path} must have tab-separated columns {sorted(required)}"
            )
        for line_number, row in enumerate(reader, start=2):
            kind = (row.get("kind") or "").strip()
            value = _optional_float(row.get("value_ml") or "")
            try:
                stamp = _parse_timestamp(row.get("timestamp_utc") or "")
            except ValueError:
                continue
            if kind not in {
                "reservoir_before",
                "reservoir_after",
                "runoff",
                "evap_reference",
            }:
                continue
            if value is None or not math.isfinite(value) or value < 0:
                continue
            measurements.append(
                ManualMeasurement(
                    timestamp_utc=stamp,
                    kind=kind,
                    value_ml=value,
                    note=(row.get("note") or "").strip(),
                    line_number=line_number,
                )
            )
    return sorted(measurements, key=lambda item: item.timestamp_utc)


def _read_journal(
    path: Path,
) -> tuple[
    list[TelemetrySample],
    list[_Command],
    list[_TerminalAck],
    dict[str, datetime],
    list[str],
    list[str],
]:
    telemetry: list[TelemetrySample] = []
    commands: list[_Command] = []
    terminal_acks: list[_TerminalAck] = []
    accepted_at: dict[str, datetime] = {}
    raw_board_lines: list[str] = []
    malformed_journal_lines: list[str] = []
    session_number = 1
    previous_was_sensor = False

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            outer = json.loads(line)
        except json.JSONDecodeError:
            malformed_journal_lines.append(line)
            previous_was_sensor = False
            continue
        if not isinstance(outer, dict):
            malformed_journal_lines.append(line)
            previous_was_sensor = False
            continue
        try:
            stamp = _parse_timestamp(str(outer["captured_at_utc"]))
        except (KeyError, ValueError):
            malformed_journal_lines.append(line)
            previous_was_sensor = False
            continue

        if "raw" in outer:
            raw_board_lines.append(str(outer["raw"]))
            previous_was_sensor = False
            continue

        if outer.get("event") == "session_boundary":
            session_number += 1
            # dose_campaign writes the reset-detecting telemetry before its
            # host event.  Retroactively moving that adjacent sample prevents
            # the old session from borrowing the first sample of the new board.
            if previous_was_sensor and telemetry:
                telemetry[-1].session_id = _session_name(session_number)
            previous_was_sensor = False
            continue

        if outer.get("event") == "command_sent":
            command = outer.get("command")
            if isinstance(command, dict) and isinstance(command.get("id"), str):
                commands.append(
                    _Command(
                        command_id=command["id"],
                        captured_at_utc=stamp,
                        session_id=_session_name(session_number),
                        requested_ml=_number(command.get("ml")),
                    )
                )
            previous_was_sensor = False
            continue

        payload = outer.get("payload")
        if not isinstance(payload, dict):
            previous_was_sensor = False
            continue

        message_type = payload.get("message_type")
        if message_type in {"telemetry", "sensor_status"}:
            telemetry.append(
                TelemetrySample(
                    captured_at_utc=stamp,
                    session_id=_session_name(session_number),
                    message_type=str(message_type),
                    soil_moisture_raw_adc=_number(
                        payload.get("soil_moisture_raw_adc")
                    ),
                    soil_moisture_pct=_number(payload.get("soil_moisture_pct")),
                    soil_temperature_c=_number(payload.get("soil_temperature_c")),
                    air_temperature_c=_number(payload.get("air_temperature_c")),
                    relative_humidity_pct=_number(
                        payload.get("relative_humidity_pct")
                    ),
                    illuminance_lux=_number(payload.get("illuminance_lux")),
                    ppfd_umol_m2_s=_number(payload.get("ppfd_umol_m2_s")),
                )
            )
            previous_was_sensor = True
            continue

        if payload.get("t") == "ack" and isinstance(payload.get("id"), str):
            phase = payload.get("ph")
            command_id = payload["id"]
            if phase == "accepted":
                accepted_at.setdefault(command_id, stamp)
            elif phase in {"completed", "aborted"}:
                actual_ms = _nonnegative_int(payload.get("ms"))
                if actual_ms is not None:
                    terminal_acks.append(
                        _TerminalAck(
                            command_id=command_id,
                            captured_at_utc=stamp,
                            session_id=_session_name(session_number),
                            phase=str(phase),
                            actual_ms=actual_ms,
                            ml=_number(payload.get("ml")),
                        )
                    )
        previous_was_sensor = False

    return (
        telemetry,
        commands,
        terminal_acks,
        accepted_at,
        raw_board_lines,
        malformed_journal_lines,
    )


def _moisture_value(
    sample: TelemetrySample,
    dry_adc: float | None,
    wet_adc: float | None,
) -> float | None:
    if dry_adc is not None and wet_adc is not None:
        if sample.soil_moisture_raw_adc is None:
            return None
        return recompute_soil_moisture_pct(
            sample.soil_moisture_raw_adc, dry_adc, wet_adc
        )
    return sample.soil_moisture_pct


def fit_dose_response(
    pre_dose: TelemetrySample,
    post_dose: Sequence[TelemetrySample],
    *,
    dosed_at_utc: datetime,
    soil_moisture_dry_adc: float | None = None,
    soil_moisture_wet_adc: float | None = None,
    minimum_response_samples: int = 6,
    minimum_drying_samples: int = 4,
) -> FitResult:
    """Fit a first-order rise and a post-settling drying line.

    The rise and drying slope are fitted together for each candidate time
    constant.  The final drying rate is then independently fitted only after
    98 percent of the response has settled.
    """

    method = (
        "raw-ADC-derived moisture; first-order grid fit followed by linear "
        "post-98%-settled drying fit"
    )
    if soil_moisture_dry_adc is None or soil_moisture_wet_adc is None:
        method = (
            "payload moisture percent; first-order grid fit followed by "
            "linear post-98%-settled drying fit"
        )
    baseline = _moisture_value(
        pre_dose, soil_moisture_dry_adc, soil_moisture_wet_adc
    )
    usable: list[tuple[TelemetrySample, float, float]] = []
    for sample in post_dose:
        elapsed = (sample.captured_at_utc - dosed_at_utc).total_seconds()
        moisture = _moisture_value(
            sample, soil_moisture_dry_adc, soil_moisture_wet_adc
        )
        if elapsed > 0 and moisture is not None:
            usable.append((sample, elapsed, moisture))

    evidence = FitEvidence(
        sample_count=len(usable),
        method=method,
        started_at_utc=dosed_at_utc,
        ended_at_utc=usable[-1][0].captured_at_utc if usable else None,
    )
    if baseline is None:
        return UncalibratedResult(
            "dose_response", "pre-dose moisture is unavailable", evidence
        )
    if len(usable) < minimum_response_samples:
        return UncalibratedResult(
            "dose_response",
            f"need at least {minimum_response_samples} post-dose samples; "
            f"found {len(usable)}",
            evidence,
        )

    times = np.asarray([item[1] for item in usable], dtype=np.float64)
    changes = np.asarray([item[2] - baseline for item in usable], dtype=np.float64)
    positive_steps = np.diff(np.concatenate(([0.0], times)))
    positive_steps = positive_steps[positive_steps > 0]
    if len(positive_steps) == 0 or times[-1] <= 0:
        return UncalibratedResult(
            "dose_response", "post-dose timestamps have no positive span", evidence
        )

    minimum_tau = max(float(np.min(positive_steps)) / 10.0, 0.1)
    maximum_tau = max(times[-1] * 2.0, minimum_tau * 10.0)
    candidates = np.geomspace(minimum_tau, maximum_tau, 1200)
    best: tuple[float, float, float, float] | None = None
    time_hours = times / 3600.0
    for tau in candidates:
        response = 1.0 - np.exp(-times / tau)
        design = np.column_stack((response, time_hours))
        coefficients, _, rank, _ = np.linalg.lstsq(design, changes, rcond=None)
        if rank < 2:
            continue
        rise, long_slope = (float(value) for value in coefficients)
        residual = changes - design @ coefficients
        rss = float(residual @ residual)
        if best is None or rss < best[0]:
            best = (rss, float(tau), rise, long_slope)

    if best is None or best[2] <= 0:
        return UncalibratedResult(
            "dose_response", "samples do not contain a positive moisture rise", evidence
        )
    _, tau, rise, _ = best
    settled_seconds = tau * _SETTLED_TIME_CONSTANTS
    drying_indexes = np.flatnonzero(times >= settled_seconds)
    if len(drying_indexes) < minimum_drying_samples:
        return UncalibratedResult(
            "dose_response",
            f"need at least {minimum_drying_samples} samples after the response "
            f"settles; found {len(drying_indexes)}",
            evidence,
        )

    drying_times_hours = time_hours[drying_indexes]
    drying_values = changes[drying_indexes]
    drying_slope, _ = np.polyfit(drying_times_hours, drying_values, 1)
    drying_rate = -float(drying_slope)
    if drying_rate < 0:
        return UncalibratedResult(
            "dose_response",
            "post-settling moisture is rising, so a drying rate is not identified",
            evidence,
        )
    settled_at = dosed_at_utc + timedelta(seconds=settled_seconds)
    calibrated_evidence = FitEvidence(
        sample_count=len(usable),
        method=method,
        started_at_utc=dosed_at_utc,
        ended_at_utc=usable[-1][0].captured_at_utc,
        details=(
            f"{len(drying_indexes)} post-settling samples",
            f"settled after {settled_seconds:.3f} seconds",
        ),
    )
    return CalibratedResult(
        "dose_response",
        DoseResponseValues(
            rise_pp=rise,
            tau_seconds=tau,
            drying_rate_pp_per_hour=drying_rate,
            settled_at_utc=settled_at,
        ),
        "mixed",
        calibrated_evidence,
    )


def _closest_manual(
    measurements: Sequence[ManualMeasurement],
    used: set[int],
    *,
    kind: str,
    anchor: datetime,
    before: bool,
    maximum_seconds: float,
    after_boundary: datetime | None = None,
    before_boundary: datetime | None = None,
) -> int | None:
    candidates: list[tuple[float, int]] = []
    for index, measurement in enumerate(measurements):
        if index in used or measurement.kind != kind:
            continue
        if after_boundary is not None and measurement.timestamp_utc <= after_boundary:
            continue
        if before_boundary is not None and measurement.timestamp_utc >= before_boundary:
            continue
        delta = (anchor - measurement.timestamp_utc).total_seconds()
        if not before:
            delta = -delta
        if 0 <= delta <= maximum_seconds:
            candidates.append((delta, index))
    return min(candidates)[1] if candidates else None


def _attach_manual_measurements(
    records: list[DoseRecord],
    measurements: Sequence[ManualMeasurement],
    maximum_seconds: float,
) -> set[int]:
    used: set[int] = set()
    for record_index, record in enumerate(records):
        previous_dose = (
            records[record_index - 1].dosed_at_utc if record_index > 0 else None
        )
        next_dose = (
            records[record_index + 1].dosed_at_utc
            if record_index + 1 < len(records)
            else None
        )
        selected: dict[str, int | None] = {
            "reservoir_before": _closest_manual(
                measurements,
                used,
                kind="reservoir_before",
                anchor=record.dosed_at_utc,
                before=True,
                maximum_seconds=maximum_seconds,
                after_boundary=previous_dose,
            ),
            "reservoir_after": _closest_manual(
                measurements,
                used,
                kind="reservoir_after",
                anchor=record.dosed_at_utc,
                before=False,
                maximum_seconds=maximum_seconds,
                before_boundary=next_dose,
            ),
            "runoff": _closest_manual(
                measurements,
                used,
                kind="runoff",
                anchor=record.dosed_at_utc,
                before=False,
                maximum_seconds=maximum_seconds,
                before_boundary=next_dose,
            ),
        }
        for index in selected.values():
            if index is not None:
                used.add(index)

        before_index = selected["reservoir_before"]
        after_index = selected["reservoir_after"]
        if before_index is not None and after_index is not None:
            record.dose_ml_measured = (
                measurements[before_index].value_ml
                - measurements[after_index].value_ml
            )
            record.dose_ml_delivered = record.dose_ml_measured
            record.delivered_source = "measured"
        runoff_index = selected["runoff"]
        if runoff_index is not None:
            record.runoff_ml = measurements[runoff_index].value_ml
        if record.dose_ml_delivered is not None and record.runoff_ml is not None:
            record.absorbed_ml = record.dose_ml_delivered - record.runoff_ml
    return used


def load_dose_response_campaign(
    journal_path: Path,
    manual_log_path: Path | None = None,
    *,
    manifest_path: Path | None = None,
    soil_moisture_dry_adc: float | None = None,
    soil_moisture_wet_adc: float | None = None,
    flow_ml_per_s: float | None = None,
    manual_match_seconds: float = DEFAULT_MANUAL_MATCH_SECONDS,
) -> DoseResponseCampaign:
    """Join journal telemetry, terminal acks, commands, and cup measurements."""

    manifest = _read_manifest(manifest_path)
    if soil_moisture_dry_adc is None and soil_moisture_wet_adc is None:
        soil_moisture_dry_adc = _number(manifest.get("soil_moisture_dry_adc"))
        soil_moisture_wet_adc = _number(manifest.get("soil_moisture_wet_adc"))
        for field_name, endpoint in (
            ("soil_moisture_dry_adc", soil_moisture_dry_adc),
            ("soil_moisture_wet_adc", soil_moisture_wet_adc),
        ):
            if field_name in manifest and endpoint is None:
                raise DoseResponseError(
                    f"manifest {field_name} must be a finite number"
                )
    if (soil_moisture_dry_adc is None) != (soil_moisture_wet_adc is None):
        raise DoseResponseError("both ADC calibration endpoints must be supplied")
    if (
        soil_moisture_dry_adc is not None
        and soil_moisture_wet_adc is not None
        and (
            not math.isfinite(soil_moisture_dry_adc)
            or not math.isfinite(soil_moisture_wet_adc)
            or soil_moisture_dry_adc == soil_moisture_wet_adc
        )
    ):
        raise DoseResponseError("ADC calibration endpoints must be finite and differ")
    if manual_match_seconds <= 0:
        raise DoseResponseError("manual_match_seconds must be positive")
    if flow_ml_per_s is None:
        flow_ml_per_s = _number(manifest.get("flow_ml_per_s"))
        if "flow_ml_per_s" in manifest and flow_ml_per_s is None:
            raise DoseResponseError(
                "manifest flow_ml_per_s must be a finite number"
            )
    if flow_ml_per_s is None:
        flow_ml_per_s = DEFAULT_FLOW_ML_PER_S
    if not math.isfinite(flow_ml_per_s) or flow_ml_per_s <= 0:
        raise DoseResponseError("flow_ml_per_s must be finite and positive")
    substrate_volume_ml = _number(manifest.get("substrate_volume_ml"))
    if "substrate_volume_ml" in manifest and substrate_volume_ml is None:
        raise DoseResponseError(
            "manifest substrate_volume_ml must be a finite number"
        )
    if substrate_volume_ml is not None and substrate_volume_ml <= 0:
        raise DoseResponseError("manifest substrate_volume_ml must be positive")

    (
        telemetry,
        commands,
        terminal_acks,
        accepted_at,
        raw_board_lines,
        malformed_journal_lines,
    ) = _read_journal(journal_path)
    if not terminal_acks:
        raise DoseResponseError(f"{journal_path} contains no terminal dose acks")

    commands_by_id = {command.command_id: command for command in commands}
    records: list[DoseRecord] = []
    for ack in terminal_acks:
        command = commands_by_id.get(ack.command_id)
        commanded_ml = ack.ml
        if commanded_ml is None and command is not None:
            commanded_ml = command.requested_ml
        dosed_at = accepted_at.get(
            ack.command_id,
            command.captured_at_utc if command is not None else ack.captured_at_utc,
        )
        reason: str | None = None
        # Terminal runtime is physical evidence for both completed and aborted
        # doses. In particular, an aborted ack's `ml` is only the request label,
        # so it must never be reported as the partial delivered volume.
        delivered_ml = flow_ml_per_s * ack.actual_ms / 1_000.0

        session_id = ack.session_id
        if command is not None:
            session_id = command.session_id
        pre_candidates = [
            sample
            for sample in telemetry
            if sample.session_id == session_id
            and sample.captured_at_utc <= dosed_at
        ]
        pre_dose = pre_candidates[-1] if pre_candidates else None
        pre_pct = (
            _moisture_value(
                pre_dose, soil_moisture_dry_adc, soil_moisture_wet_adc
            )
            if pre_dose is not None
            else None
        )
        if pre_dose is None and reason is None:
            reason = "no pre-dose telemetry in this board session"
        records.append(
            DoseRecord(
                session_id=session_id,
                command_id=ack.command_id,
                dosed_at_utc=dosed_at,
                dose_ml_commanded=commanded_ml,
                dose_ml_delivered=delivered_ml,
                dose_ml_measured=None,
                delivered_source="flow_estimate",
                runoff_ml=None,
                absorbed_ml=None,
                actual_runtime_ms=ack.actual_ms,
                pre_dose_soil_moisture_pct=pre_pct,
                pre_dose_soil_moisture_raw_adc=(
                    pre_dose.soil_moisture_raw_adc if pre_dose else None
                ),
                pre_dose_soil_temperature_c=(
                    pre_dose.soil_temperature_c if pre_dose else None
                ),
                pre_dose_air_temperature_c=(
                    pre_dose.air_temperature_c if pre_dose else None
                ),
                pre_dose_relative_humidity_pct=(
                    pre_dose.relative_humidity_pct if pre_dose else None
                ),
                pre_dose_illuminance_lux=(
                    pre_dose.illuminance_lux if pre_dose else None
                ),
                rise_pp=None,
                tau_seconds=None,
                drying_rate_pp_per_hour=None,
                excluded=reason is not None,
                exclusion_reason=reason,
                phase=ack.phase,
            )
        )

    records.sort(key=lambda record: record.dosed_at_utc)
    measurements = _read_manual_log(manual_log_path)
    used_manual = _attach_manual_measurements(
        records, measurements, manual_match_seconds
    )

    for index, record in enumerate(records):
        pre_dose_candidates = [
            sample
            for sample in telemetry
            if sample.session_id == record.session_id
            and sample.captured_at_utc <= record.dosed_at_utc
        ]
        if not pre_dose_candidates:
            continue
        later_doses = [
            other.dosed_at_utc
            for other in records[index + 1 :]
            if other.session_id == record.session_id
        ]
        interval_end = min(later_doses) if later_doses else None
        post_dose = [
            sample
            for sample in telemetry
            if sample.session_id == record.session_id
            and sample.captured_at_utc > record.dosed_at_utc
            and (interval_end is None or sample.captured_at_utc < interval_end)
        ]
        response = fit_dose_response(
            pre_dose_candidates[-1],
            post_dose,
            dosed_at_utc=record.dosed_at_utc,
            soil_moisture_dry_adc=soil_moisture_dry_adc,
            soil_moisture_wet_adc=soil_moisture_wet_adc,
        )
        record.response_evidence = response.evidence
        if isinstance(response, CalibratedResult):
            values = response.value
            if not isinstance(values, DoseResponseValues):
                raise AssertionError("dose response returned an invalid value")
            record.rise_pp = values.rise_pp
            record.tau_seconds = values.tau_seconds
            record.drying_rate_pp_per_hour = values.drying_rate_pp_per_hour
        else:
            record.excluded = True
            if record.exclusion_reason is None:
                record.exclusion_reason = response.reason

    return DoseResponseCampaign(
        records=records,
        telemetry=telemetry,
        manual_measurements=measurements,
        unmatched_manual_measurements=[
            measurement
            for index, measurement in enumerate(measurements)
            if index not in used_manual
        ],
        raw_board_lines=raw_board_lines,
        malformed_journal_lines=malformed_journal_lines,
        soil_moisture_dry_adc=soil_moisture_dry_adc,
        soil_moisture_wet_adc=soil_moisture_wet_adc,
        substrate_volume_ml=substrate_volume_ml,
        flow_ml_per_s=flow_ml_per_s,
    )


# A concise alias is convenient in notebooks while the long name remains
# unambiguous beside the older capture loader.
load_campaign = load_dose_response_campaign


def _uncalibrated(
    name: str,
    reason: str,
    *,
    sample_count: int = 0,
    method: str,
) -> UncalibratedResult:
    return UncalibratedResult(
        name,
        reason,
        FitEvidence(sample_count=sample_count, method=method),
    )


def fit_water_holding_fraction(
    campaign: DoseResponseCampaign,
    *,
    substrate_volume_ml: float | None = None,
    minimum_persistent_runoff_doses: int = MIN_PERSISTENT_RUNOFF_DOSES,
) -> FitResult:
    """Fit capacity from absorbed cup volume at persistent-runoff onset."""

    method = (
        "cumulative delivered-minus-runoff volume from a dry start through "
        "the onset of persistent runoff, divided by substrate volume"
    )
    records = sorted(campaign.records, key=lambda item: item.dosed_at_utc)
    volume_ml = (
        substrate_volume_ml
        if substrate_volume_ml is not None
        else campaign.substrate_volume_ml
    )
    if volume_ml is None or not math.isfinite(volume_ml) or volume_ml <= 0:
        return _uncalibrated(
            "water_holding_fraction",
            "manifest substrate_volume_ml must be finite and positive",
            method=method,
        )
    if minimum_persistent_runoff_doses <= 0:
        raise ValueError("minimum_persistent_runoff_doses must be positive")
    if not records:
        return _uncalibrated(
            "water_holding_fraction",
            "the campaign contains no dose records",
            method=method,
        )

    start_moisture = records[0].pre_dose_soil_moisture_pct
    if start_moisture is None or start_moisture > DRY_START_MAX_MOISTURE_PCT:
        found = "unavailable" if start_moisture is None else f"{start_moisture:.6g}%"
        return _uncalibrated(
            "water_holding_fraction",
            "run must start dry: first pre-dose moisture must be at most "
            f"{DRY_START_MAX_MOISTURE_PCT:.6g}%; found {found}",
            method=method,
        )

    onset_index: int | None = None
    for index, record in enumerate(records):
        confirmation = records[index : index + minimum_persistent_runoff_doses]
        if len(confirmation) < minimum_persistent_runoff_doses:
            continue
        if all(
            item.runoff_ml is not None and item.runoff_ml > 0
            for item in confirmation
        ):
            onset_index = index
            break
    if onset_index is None:
        positive_count = sum(
            record.runoff_ml is not None and record.runoff_ml > 0
            for record in records
        )
        return _uncalibrated(
            "water_holding_fraction",
            "run did not reach persistent runoff: need "
            f"{minimum_persistent_runoff_doses} consecutive positive runoff "
            f"measurements; found {positive_count} positive measurements",
            sample_count=len(records),
            method=method,
        )

    capacity_records = records[: onset_index + 1]
    incomplete = [
        record.command_id
        for record in capacity_records
        if record.dose_ml_delivered is None
        or record.dose_ml_delivered <= 0
        or record.runoff_ml is None
        or record.absorbed_ml is None
        or record.absorbed_ml < 0
    ]
    if incomplete:
        return _uncalibrated(
            "water_holding_fraction",
            "every dose through runoff onset needs measured runoff, including "
            f"an explicit 0 mL for a dry saucer; incomplete: {', '.join(incomplete)}",
            sample_count=len(capacity_records) - len(incomplete),
            method=method,
        )

    absorbed_ml = sum(record.absorbed_ml or 0.0 for record in capacity_records)
    if absorbed_ml <= 0:
        return _uncalibrated(
            "water_holding_fraction",
            "cumulative absorbed volume through runoff onset is not positive",
            sample_count=len(capacity_records),
            method=method,
        )
    evidence = FitEvidence(
        sample_count=len(capacity_records),
        method=method,
        started_at_utc=capacity_records[0].dosed_at_utc,
        ended_at_utc=capacity_records[-1].dosed_at_utc,
        details=(
            f"dry-start moisture {start_moisture:.6g}%",
            f"cumulative absorbed volume {absorbed_ml:.6g} mL",
            f"persistent runoff began at dose {capacity_records[-1].command_id}",
            f"confirmed by {minimum_persistent_runoff_doses} runoff doses",
        ),
    )
    return CalibratedResult(
        "water_holding_fraction",
        absorbed_ml / volume_ml,
        "fraction",
        evidence,
    )


def fit_irrigation_efficiency(
    campaign: DoseResponseCampaign,
    *,
    minimum_doses: int = MIN_EFFICIENCY_DOSES,
) -> FitResult:
    """Fit absorbed cup volume divided by delivered cup volume."""

    method = "sum of per-dose delivered-minus-runoff volume divided by delivery"
    usable = [
        record
        for record in campaign.records
        if record.dose_ml_delivered is not None
        and record.dose_ml_delivered > 0
        and record.runoff_ml is not None
        and record.absorbed_ml is not None
        and 0 <= record.absorbed_ml <= record.dose_ml_delivered
    ]
    if len(usable) < minimum_doses:
        return _uncalibrated(
            "irrigation_efficiency",
            f"need at least {minimum_doses} doses with explicit runoff; "
            f"found {len(usable)}",
            sample_count=len(usable),
            method=method,
        )
    delivered_ml = sum(record.dose_ml_delivered or 0.0 for record in usable)
    absorbed_ml = sum(record.absorbed_ml or 0.0 for record in usable)
    if delivered_ml <= 0:
        return _uncalibrated(
            "irrigation_efficiency",
            "cup measurements do not contain positive delivered volume",
            sample_count=len(usable),
            method=method,
        )
    # Water evaporated during an approximately 80-second dose is negligible,
    # so delivered minus saucer runoff is the volume absorbed by the substrate.
    evidence = FitEvidence(
        sample_count=len(usable),
        method=method,
        started_at_utc=usable[0].dosed_at_utc,
        ended_at_utc=usable[-1].dosed_at_utc,
        details=(
            f"delivered volume {delivered_ml:.6g} mL",
            f"absorbed volume {absorbed_ml:.6g} mL",
            "explicit 0 mL runoff rows included; absent runoff rows excluded",
            "evaporation during each approximately 80-second dose is negligible",
        ),
    )
    return CalibratedResult(
        "irrigation_efficiency", absorbed_ml / delivered_ml, "fraction", evidence
    )


@dataclass(frozen=True)
class _DryingObservation:
    started_at_utc: datetime
    ended_at_utc: datetime
    moisture_pct: float
    normalized_loss_pp_per_hour: float


def _environmental_driver(
    samples: Sequence[TelemetrySample], ppfd_per_lux: float
) -> float | None:
    air = [
        sample.air_temperature_c
        for sample in samples
        if sample.air_temperature_c is not None
    ]
    humidity = [
        sample.relative_humidity_pct
        for sample in samples
        if sample.relative_humidity_pct is not None
    ]
    ppfd = [
        sample.ppfd_umol_m2_s
        if sample.ppfd_umol_m2_s is not None
        else (
            sample.illuminance_lux * ppfd_per_lux
            if sample.illuminance_lux is not None
            else None
        )
        for sample in samples
    ]
    ppfd = [value for value in ppfd if value is not None]
    if not air or not humidity or not ppfd:
        return None
    vapour_deficit = min(1.0, max(0.05, 1.0 - float(np.mean(humidity)) / 100.0))
    light = 0.30 + float(np.mean(ppfd)) / 800.0
    warmth = min(3.0, max(0.2, 1.0 + 0.045 * (float(np.mean(air)) - 20.0)))
    return vapour_deficit * light * warmth


def _drying_observations(
    campaign: DoseResponseCampaign,
    ppfd_per_lux: float,
) -> list[_DryingObservation]:
    telemetry = sorted(campaign.telemetry, key=lambda item: item.captured_at_utc)
    observations: list[_DryingObservation] = []
    for first, second in zip(telemetry, telemetry[1:]):
        if first.session_id != second.session_id:
            continue
        hours = (
            second.captured_at_utc - first.captured_at_utc
        ).total_seconds() / 3600.0
        if hours <= 0:
            continue
        if any(
            record.session_id == first.session_id
            and first.captured_at_utc < record.dosed_at_utc <= second.captured_at_utc
            for record in campaign.records
        ):
            continue
        first_moisture = _moisture_value(
            first,
            campaign.soil_moisture_dry_adc,
            campaign.soil_moisture_wet_adc,
        )
        second_moisture = _moisture_value(
            second,
            campaign.soil_moisture_dry_adc,
            campaign.soil_moisture_wet_adc,
        )
        if (
            first_moisture is None
            or second_moisture is None
            or first_moisture <= second_moisture
        ):
            continue
        environmental_driver = _environmental_driver((first, second), ppfd_per_lux)
        if environmental_driver is None or environmental_driver <= 0:
            continue
        loss_pp_per_hour = (first_moisture - second_moisture) / hours
        observations.append(
            _DryingObservation(
                started_at_utc=first.captured_at_utc,
                ended_at_utc=second.captured_at_utc,
                moisture_pct=(first_moisture + second_moisture) / 2.0,
                normalized_loss_pp_per_hour=loss_pp_per_hour / environmental_driver,
            )
        )
    return observations


_SURFACE_AREA_PATTERN = re.compile(
    r"(?:surface_area_cm2|area_cm2)\s*[:=]\s*"
    r"(?P<area>[0-9]+(?:\.[0-9]+)?)",
    re.IGNORECASE,
)


def _evap_reference_details(
    campaign: DoseResponseCampaign, ppfd_per_lux: float
) -> tuple[str, ...]:
    references = sorted(
        (
            item
            for item in campaign.manual_measurements
            if item.kind == "evap_reference"
        ),
        key=lambda item: item.timestamp_utc,
    )
    if not references:
        return ()

    demands: list[float] = []
    drivers: list[float] = []
    for first, second in zip(references, references[1:]):
        hours = (second.timestamp_utc - first.timestamp_utc).total_seconds() / 3600.0
        area_match = _SURFACE_AREA_PATTERN.search(
            f"{first.note} {second.note}"
        )
        if hours <= 0 or area_match is None:
            continue
        area_cm2 = float(area_match.group("area"))
        if area_cm2 <= 0:
            continue
        # Each row is the cup-measured loss since the previous cadence point;
        # the earlier row supplies that interval's start timestamp.
        loss_ml = second.value_ml
        if loss_ml <= 0:
            continue
        samples = [
            sample
            for sample in campaign.telemetry
            if first.timestamp_utc <= sample.captured_at_utc <= second.timestamp_utc
        ]
        driver = _environmental_driver(samples, ppfd_per_lux)
        if driver is None or driver <= 0:
            continue
        demands.append(loss_ml / area_cm2 / hours)
        drivers.append(driver)

    limitation = (
        "evap_reference is independent of the probe but is open water, so it "
        "cannot calibrate the soil-specific availability term"
    )
    if not demands:
        return (
            "evap_reference rows were present but lacked usable cadence, "
            "surface_area_cm2 note metadata, loss, or covariates",
            limitation,
        )
    if len(demands) >= 2 and float(np.ptp(drivers)) > 0:
        correlation = float(np.corrcoef(demands, drivers)[0, 1])
        assessment = "tracks" if correlation >= 0.5 else "does not track"
        check = (
            f"evap_reference ambient-demand sanity check: {len(demands)} "
            f"intervals, correlation {correlation:.6g}; open-water loss "
            f"{assessment} vapour-deficit/warmth/light covariates"
        )
    else:
        normalized = float(np.mean(np.asarray(demands) / np.asarray(drivers)))
        check = (
            "evap_reference ambient-demand sanity check: "
            f"{len(demands)} usable interval(s), mean loss/area/hour/driver "
            f"{normalized:.6g} mL/cm2/hour"
        )
    return (check, limitation)


def fit_evapotranspiration(
    campaign: DoseResponseCampaign,
    *,
    minimum_intervals: int = MIN_ET_INTERVALS,
    ppfd_per_lux: float = _PPFD_PER_LUX,
) -> EvapotranspirationCalibration:
    """Conditionally fit the 3.5 scale and availability from probe drying."""

    method = (
        "no-dose raw-ADC-derived moisture loss normalized by vapour deficit, "
        "light, and air warmth; grid fit of "
        "K*clip(moisture/reference,0.25,1.2)"
    )
    dry_adc = campaign.soil_moisture_dry_adc
    wet_adc = campaign.soil_moisture_wet_adc
    if (
        dry_adc is None
        or wet_adc is None
        or not math.isfinite(dry_adc)
        or not math.isfinite(wet_adc)
        or dry_adc == wet_adc
    ):
        reason = (
            "explicit DRY and WET ADC endpoints are required because probe-only "
            "evapotranspiration is conditional on that calibration"
        )
        refusal = _uncalibrated(
            "evapotranspiration_constant",
            reason,
            method=method,
        )
        availability = _uncalibrated(
            "availability", refusal.reason, method=method
        )
        return EvapotranspirationCalibration(refusal, availability)
    observations = _drying_observations(campaign, ppfd_per_lux)
    if len(observations) < minimum_intervals:
        reason = (
            f"need at least {minimum_intervals} complete no-dose probe-drying "
            f"intervals; found {len(observations)}"
        )
        return EvapotranspirationCalibration(
            _uncalibrated(
                "evapotranspiration_constant",
                reason,
                sample_count=len(observations),
                method=method,
            ),
            _uncalibrated(
                "availability",
                reason,
                sample_count=len(observations),
                method=method,
            ),
        )

    moisture = np.asarray(
        [item.moisture_pct for item in observations], dtype=np.float64
    )
    loss = np.asarray(
        [item.normalized_loss_pp_per_hour for item in observations],
        dtype=np.float64,
    )
    if float(np.ptp(moisture)) < 15.0:
        reason = (
            "moisture span is under 15 percentage points, so availability "
            "is unidentifiable"
        )
        return EvapotranspirationCalibration(
            _uncalibrated(
                "evapotranspiration_constant",
                reason,
                sample_count=len(observations),
                method=method,
            ),
            _uncalibrated(
                "availability",
                reason,
                sample_count=len(observations),
                method=method,
            ),
        )

    references = np.linspace(10.0, 100.0, 3601)
    best: tuple[float, float, float, np.ndarray] | None = None
    for reference in references:
        factors = np.clip(
            moisture / reference,
            _AVAILABILITY_MINIMUM,
            _AVAILABILITY_MAXIMUM,
        )
        denominator = float(factors @ factors)
        if denominator <= 0:
            continue
        constant = float(factors @ loss) / denominator
        if constant <= 0:
            continue
        residual = loss - constant * factors
        rss = float(residual @ residual)
        if best is None or rss < best[0]:
            best = (rss, reference, constant, factors)
    if best is None:
        reason = "probe-drying intervals do not identify a positive evaporation scale"
        return EvapotranspirationCalibration(
            _uncalibrated(
                "evapotranspiration_constant",
                reason,
                sample_count=len(observations),
                method=method,
            ),
            _uncalibrated(
                "availability",
                reason,
                sample_count=len(observations),
                method=method,
            ),
        )
    _, reference, constant, factors = best
    linear_count = int(
        np.count_nonzero(
            (factors > _AVAILABILITY_MINIMUM + 1e-9)
            & (factors < _AVAILABILITY_MAXIMUM - 1e-9)
        )
    )
    plateau_count = int(
        np.count_nonzero(factors >= _AVAILABILITY_MAXIMUM - 1e-9)
    )
    if linear_count < 2 or plateau_count < 2:
        reason = (
            "availability scale and evaporation constant are confounded; need "
            "at least two linear-region and two wet-plateau intervals"
        )
        return EvapotranspirationCalibration(
            _uncalibrated(
                "evapotranspiration_constant",
                reason,
                sample_count=len(observations),
                method=method,
            ),
            _uncalibrated(
                "availability",
                reason,
                sample_count=len(observations),
                method=method,
            ),
        )

    evidence = FitEvidence(
        sample_count=len(observations),
        method=method,
        started_at_utc=observations[0].started_at_utc,
        ended_at_utc=observations[-1].ended_at_utc,
        details=(
            f"moisture span {float(np.ptp(moisture)):.6g} pp",
            f"{linear_count} linear-region intervals",
            f"{plateau_count} wet-plateau intervals",
            f"DRY ADC endpoint {dry_adc:.6g}",
            f"WET ADC endpoint {wet_adc:.6g}",
            f"lux-to-PPFD coefficient {ppfd_per_lux:.6g}",
            "soil roots factor intentionally omitted: this campaign has no plant",
            "probe-only drying inherits any error in the provisional ADC endpoints",
            *_evap_reference_details(campaign, ppfd_per_lux),
        ),
    )
    return EvapotranspirationCalibration(
        constant=ConditionalResult(
            "evapotranspiration_constant",
            constant,
            "pp/hour",
            evidence,
            soil_moisture_dry_adc=dry_adc,
            soil_moisture_wet_adc=wet_adc,
        ),
        availability=ConditionalResult(
            "availability",
            AvailabilityTerm(
                reference_moisture_pct=reference,
                minimum_factor=_AVAILABILITY_MINIMUM,
                maximum_factor=_AVAILABILITY_MAXIMUM,
            ),
            "dimensionless function",
            evidence,
            soil_moisture_dry_adc=dry_adc,
            soil_moisture_wet_adc=wet_adc,
        ),
    )


def structurally_uncalibrated_constants() -> dict[str, UncalibratedResult]:
    """Report constants this soil-only, single-pot campaign cannot identify."""

    no_samples = FitEvidence(
        sample_count=0,
        method="structural identifiability check before numerical fitting",
    )
    return {
        "roots": UncalibratedResult(
            "roots",
            "there is no plant, so the campaign contains no transpiration signal",
            no_samples,
        ),
        "wetted_fraction": UncalibratedResult(
            "wetted_fraction",
            "one pot volume makes volume dependence unobservable",
            no_samples,
        ),
        "CROP_TARGET_MOISTURE_PCT": UncalibratedResult(
            "CROP_TARGET_MOISTURE_PCT",
            "there is no plant or crop response in a soil-only campaign",
            no_samples,
        ),
    }


def fit_water_balance_constants(
    campaign: DoseResponseCampaign,
    *,
    substrate_volume_ml: float | None = None,
) -> WaterBalanceCalibration:
    """Build one status-explicit report for every relevant model constant."""

    holding = fit_water_holding_fraction(
        campaign,
        substrate_volume_ml=substrate_volume_ml,
    )
    efficiency = fit_irrigation_efficiency(campaign)
    # Probe loss is already in percentage points per hour, so this conditional
    # fit does not depend on the independently measured holding capacity.
    et = fit_evapotranspiration(campaign)
    structural = structurally_uncalibrated_constants()
    return WaterBalanceCalibration(
        water_holding_fraction=holding,
        irrigation_efficiency=efficiency,
        evapotranspiration_constant=et.constant,
        availability=et.availability,
        roots=structural["roots"],
        wetted_fraction=structural["wetted_fraction"],
        crop_target_moisture_pct=structural["CROP_TARGET_MOISTURE_PCT"],
    )
