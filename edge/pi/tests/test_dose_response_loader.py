from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

import pytest


TOOLS_DIR = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS_DIR))

import dose_response_loader as loader  # noqa: E402


UTC = timezone.utc
START = datetime(2026, 8, 25, 0, 0, tzinfo=UTC)
DRY_ADC = 800.0
WET_ADC = 400.0


def _stamp(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _outer(stamp: datetime, **contents: object) -> dict[str, object]:
    return {"captured_at_utc": _stamp(stamp), **contents}


def _adc(moisture_pct: float) -> float:
    return DRY_ADC + moisture_pct / 100.0 * (WET_ADC - DRY_ADC)


def _telemetry(
    stamp: datetime,
    moisture_pct: float,
    *,
    sequence: int = 0,
    air_temperature_c: float = 20.0,
    relative_humidity_pct: float = 0.0,
    ppfd_umol_m2_s: float = 560.0,
) -> dict[str, object]:
    return _outer(
        stamp,
        payload={
            "message_type": "telemetry",
            "sequence": sequence,
            "soil_moisture_raw_adc": _adc(moisture_pct),
            # Deliberately wrong: supplied endpoints must make raw ADC primary.
            "soil_moisture_pct": -999.0,
            "soil_temperature_c": 20.0,
            "air_temperature_c": air_temperature_c,
            "relative_humidity_pct": relative_humidity_pct,
            "ppfd_umol_m2_s": ppfd_umol_m2_s,
            "illuminance_lux": 30_000.0,
        },
    )


def _dose_rows(
    dosed_at: datetime,
    command_id: str,
    *,
    requested_ml: float = 100.0,
    requested_ms: int = 100_000,
    actual_ms: int = 100_000,
    phase: str = "completed",
    terminal_ml: float | None = 100.0,
) -> list[dict[str, object]]:
    command = {
        "t": "cmd",
        "id": command_id,
        "act": "pump",
        "ms": requested_ms,
        "ml": requested_ml,
    }
    terminal: dict[str, object] = {
        "t": "ack",
        "id": command_id,
        "ph": phase,
        "ms": actual_ms,
        "stop": "volume_reached" if phase == "completed" else "watchdog",
    }
    if terminal_ml is not None:
        terminal["ml"] = terminal_ml
    return [
        _outer(
            dosed_at - timedelta(milliseconds=100),
            event="command_sent",
            command=command,
        ),
        _outer(
            dosed_at,
            payload={"t": "ack", "id": command_id, "ph": "accepted"},
        ),
        _outer(dosed_at + timedelta(seconds=1), payload=terminal),
    ]


def _write_jsonl(path: Path, rows: list[dict[str, object] | str]) -> None:
    path.write_text(
        "\n".join(
            row if isinstance(row, str) else json.dumps(row, separators=(",", ":"))
            for row in rows
        )
        + "\n",
        encoding="utf-8",
    )


def _write_manual_log(
    path: Path,
    rows: list[tuple[datetime, str, float, str]],
) -> None:
    lines = ["timestamp_utc\tkind\tvalue_ml\tnote"]
    lines.extend(
        f"{_stamp(stamp)}\t{kind}\t{value_ml}\t{note}"
        for stamp, kind, value_ml, note in rows
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _load_volume_campaign(
    root: Path,
    runoffs: list[float | None],
    *,
    start_moisture_pct: float = 0.0,
) -> loader.DoseResponseCampaign:
    journal = root / "campaign.jsonl"
    manual = root / "campaign-manual.tsv"
    manifest = root / "campaign.json"
    rows: list[dict[str, object] | str] = [
        _telemetry(START, start_moisture_pct)
    ]
    manual_rows: list[tuple[datetime, str, float, str]] = []
    for index, runoff_ml in enumerate(runoffs):
        dosed_at = START + timedelta(seconds=10 + index * 600)
        rows.extend(_dose_rows(dosed_at, f"dose-{index + 1}"))
        manual_rows.extend(
            [
                (dosed_at - timedelta(seconds=2), "reservoir_before", 1_000.0, ""),
                (dosed_at + timedelta(seconds=2), "reservoir_after", 900.0, ""),
            ]
        )
        if runoff_ml is not None:
            manual_rows.append(
                (dosed_at + timedelta(seconds=3), "runoff", runoff_ml, "")
            )
    _write_jsonl(journal, rows)
    _write_manual_log(manual, manual_rows)
    manifest.write_text(
        json.dumps(
            {
                "substrate_volume_ml": 1_000.0,
                "flow_ml_per_s": 1.0,
                "soil_moisture_dry_adc": DRY_ADC,
                "soil_moisture_wet_adc": WET_ADC,
            }
        ),
        encoding="utf-8",
    )
    return loader.load_campaign(
        journal,
        manual,
        manifest_path=manifest,
    )


def _et_campaign() -> loader.DoseResponseCampaign:
    known_constant = 3.5
    reference = 40.0
    moisture = 70.0
    telemetry: list[loader.TelemetrySample] = []
    for index in range(14):
        telemetry.append(
            loader.TelemetrySample(
                captured_at_utc=START + timedelta(hours=index),
                session_id="session-0001",
                message_type="telemetry",
                soil_moisture_raw_adc=_adc(moisture),
                soil_moisture_pct=-999.0,
                soil_temperature_c=20.0,
                air_temperature_c=20.0,
                relative_humidity_pct=0.0,
                illuminance_lux=None,
                ppfd_umol_m2_s=560.0,
            )
        )
        if index == 13:
            continue
        if moisture >= reference * loader._AVAILABILITY_MAXIMUM + known_constant * 0.6:
            loss = known_constant * loader._AVAILABILITY_MAXIMUM
        else:
            # Solve loss = K * midpoint/reference so the secant observation
            # exactly follows the model evaluated at its midpoint.
            loss = (
                known_constant
                * moisture
                / reference
                / (1.0 + known_constant / (2.0 * reference))
            )
            loss = max(
                known_constant * loader._AVAILABILITY_MINIMUM,
                min(known_constant * loader._AVAILABILITY_MAXIMUM, loss),
            )
        moisture -= loss
    return loader.DoseResponseCampaign(
        records=[],
        telemetry=telemetry,
        manual_measurements=[],
        unmatched_manual_measurements=[],
        raw_board_lines=[],
        malformed_journal_lines=[],
        soil_moisture_dry_adc=DRY_ADC,
        soil_moisture_wet_adc=WET_ADC,
    )


def test_synthetic_jsonl_recovers_known_rise_tau_and_drying_rate(
    tmp_path: Path,
) -> None:
    journal = tmp_path / "response.jsonl"
    dosed_at = START + timedelta(seconds=1)
    baseline = 20.0
    known_rise = 12.0
    known_tau_seconds = 20.0
    known_drying_rate = 0.75
    rows: list[dict[str, object] | str] = [_telemetry(START, baseline)]
    rows.extend(_dose_rows(dosed_at, "known-response", actual_ms=1_000))
    for sequence, seconds in enumerate(
        [5, 10, 20, 40, 60, 80, 120, 180, 300, 600, 1_200, 1_800, 2_400, 3_000, 3_600],
        start=1,
    ):
        moisture = (
            baseline
            + known_rise * (1.0 - loader.math.exp(-seconds / known_tau_seconds))
            - known_drying_rate * seconds / 3_600.0
        )
        rows.append(
            _telemetry(
                dosed_at + timedelta(seconds=seconds), moisture, sequence=sequence
            )
        )
    rows.append(_outer(dosed_at + timedelta(hours=2), raw="not-json-from-board"))
    _write_jsonl(journal, rows)

    campaign = loader.load_campaign(
        journal,
        soil_moisture_dry_adc=DRY_ADC,
        soil_moisture_wet_adc=WET_ADC,
        flow_ml_per_s=1.0,
    )

    record = campaign.records[0]
    assert record.pre_dose_soil_moisture_pct == pytest.approx(baseline)
    assert record.rise_pp == pytest.approx(known_rise, rel=0.015)
    assert record.tau_seconds == pytest.approx(known_tau_seconds, rel=0.025)
    assert record.drying_rate_pp_per_hour == pytest.approx(known_drying_rate, abs=0.08)
    assert campaign.raw_board_lines == ["not-json-from-board"]


def test_efficiency_uses_absorption_excludes_unknown_and_includes_zero(
    tmp_path: Path,
) -> None:
    campaign = _load_volume_campaign(tmp_path, [10.0, 20.0, None, 0.0, 15.0])
    result = loader.fit_irrigation_efficiency(campaign)

    assert isinstance(result, loader.CalibratedResult)
    assert result.value == pytest.approx((90.0 + 80.0 + 100.0 + 85.0) / 400.0)
    assert result.evidence.sample_count == 4
    assert campaign.records[2].runoff_ml is None
    assert campaign.records[2].absorbed_ml is None
    assert campaign.records[3].runoff_ml == 0.0
    assert campaign.records[3].absorbed_ml == 100.0
    assert all(record.delivered_source == "measured" for record in campaign.records)


def test_water_holding_fraction_uses_dry_start_to_persistent_runoff(
    tmp_path: Path,
) -> None:
    campaign = _load_volume_campaign(tmp_path, [0.0, 0.0, 10.0, 20.0])
    result = loader.fit_water_holding_fraction(campaign)

    assert isinstance(result, loader.CalibratedResult)
    assert result.value == pytest.approx((100.0 + 100.0 + 90.0) / 1_000.0)
    assert result.status is loader.CalibrationStatus.CALIBRATED


def test_water_holding_fraction_refuses_run_without_runoff(tmp_path: Path) -> None:
    campaign = _load_volume_campaign(tmp_path, [0.0, 0.0, 0.0, 0.0])
    result = loader.fit_water_holding_fraction(campaign)

    assert isinstance(result, loader.UncalibratedResult)
    assert "did not reach persistent runoff" in result.reason


def test_water_holding_fraction_refuses_non_dry_start(tmp_path: Path) -> None:
    campaign = _load_volume_campaign(
        tmp_path,
        [0.0, 0.0, 10.0, 20.0],
        start_moisture_pct=12.0,
    )
    result = loader.fit_water_holding_fraction(campaign)

    assert isinstance(result, loader.UncalibratedResult)
    assert "run must start dry" in result.reason


def test_aborted_delivery_uses_actual_runtime_not_ml_label(tmp_path: Path) -> None:
    journal = tmp_path / "aborted.jsonl"
    dosed_at = START + timedelta(seconds=1)
    rows: list[dict[str, object] | str] = [_telemetry(START, 0.0)]
    rows.extend(
        _dose_rows(
            dosed_at,
            "aborted",
            requested_ml=100.0,
            requested_ms=50_000,
            actual_ms=10_000,
            phase="aborted",
            terminal_ml=100.0,
        )
    )
    _write_jsonl(journal, rows)

    campaign = loader.load_campaign(journal, flow_ml_per_s=2.0)
    record = campaign.records[0]
    assert record.dose_ml_commanded == 100.0
    assert record.dose_ml_delivered == pytest.approx(20.0)
    assert record.delivered_source == "flow_estimate"


def test_session_boundary_blocks_cross_reset_rise(tmp_path: Path) -> None:
    journal = tmp_path / "reset.jsonl"
    dosed_at = START + timedelta(seconds=1)
    rows: list[dict[str, object] | str] = [_telemetry(START, 10.0)]
    rows.extend(_dose_rows(dosed_at, "before-reset", actual_ms=1_000))
    rows.extend(
        [
            _telemetry(dosed_at + timedelta(seconds=5), 45.0, sequence=0),
            _outer(
                dosed_at + timedelta(seconds=5),
                event="session_boundary",
                reason="board_reset",
            ),
            _telemetry(dosed_at + timedelta(seconds=10), 50.0, sequence=1),
        ]
    )
    _write_jsonl(journal, rows)

    campaign = loader.load_campaign(
        journal,
        soil_moisture_dry_adc=DRY_ADC,
        soil_moisture_wet_adc=WET_ADC,
    )

    assert campaign.records[0].session_id == "session-0001"
    assert campaign.telemetry[-2].session_id == "session-0002"
    assert campaign.records[0].rise_pp is None
    assert "post-dose samples" in (campaign.records[0].exclusion_reason or "")


def test_three_calibration_states_and_conditional_endpoint_provenance(
    tmp_path: Path,
) -> None:
    direct_campaign = _load_volume_campaign(tmp_path, [0.0, 0.0, 10.0, 20.0])
    holding = loader.fit_water_holding_fraction(direct_campaign)
    efficiency = loader.fit_irrigation_efficiency(direct_campaign)
    et_campaign = _et_campaign()
    et_campaign.manual_measurements = [
        loader.ManualMeasurement(
            START,
            "evap_reference",
            0.0,
            "surface_area_cm2=100 cadence start",
            2,
        ),
        loader.ManualMeasurement(
            START + timedelta(hours=1),
            "evap_reference",
            1.0,
            "surface_area_cm2=100 interval loss",
            3,
        ),
    ]
    evap = loader.fit_evapotranspiration(et_campaign)
    structural = loader.structurally_uncalibrated_constants()

    assert holding.status is loader.CalibrationStatus.CALIBRATED
    assert efficiency.status is loader.CalibrationStatus.CALIBRATED
    assert isinstance(evap.constant, loader.ConditionalResult)
    assert isinstance(evap.availability, loader.ConditionalResult)
    assert evap.constant.status is loader.CalibrationStatus.CONDITIONAL
    assert evap.constant.value == pytest.approx(3.5, rel=0.02)
    assert evap.constant.soil_moisture_dry_adc == DRY_ADC
    assert evap.constant.soil_moisture_wet_adc == WET_ADC
    assert evap.availability.soil_moisture_dry_adc == DRY_ADC
    assert evap.availability.soil_moisture_wet_adc == WET_ADC
    assert evap.availability.value.reference_moisture_pct == pytest.approx(
        40.0, abs=0.3
    )
    assert any(
        "ambient-demand sanity check" in item
        for item in evap.constant.evidence.details
    )
    assert any("cannot calibrate" in item for item in evap.constant.evidence.details)
    assert all(
        result.status is loader.CalibrationStatus.UNCALIBRATED
        for result in structural.values()
    )


def test_too_thin_response_sample_is_refused() -> None:
    pre = loader.TelemetrySample(
        captured_at_utc=START,
        session_id="session-0001",
        message_type="telemetry",
        soil_moisture_raw_adc=_adc(20.0),
        soil_moisture_pct=20.0,
        soil_temperature_c=20.0,
        air_temperature_c=20.0,
        relative_humidity_pct=50.0,
        illuminance_lux=1_000.0,
        ppfd_umol_m2_s=None,
    )
    post = [
        loader.TelemetrySample(
            captured_at_utc=START + timedelta(seconds=index + 1),
            session_id="session-0001",
            message_type="telemetry",
            soil_moisture_raw_adc=_adc(20.0 + index),
            soil_moisture_pct=20.0 + index,
            soil_temperature_c=20.0,
            air_temperature_c=20.0,
            relative_humidity_pct=50.0,
            illuminance_lux=1_000.0,
            ppfd_umol_m2_s=None,
        )
        for index in range(5)
    ]

    result = loader.fit_dose_response(
        pre,
        post,
        dosed_at_utc=START,
        soil_moisture_dry_adc=DRY_ADC,
        soil_moisture_wet_adc=WET_ADC,
    )

    assert isinstance(result, loader.UncalibratedResult)
    assert "need at least 6 post-dose samples; found 5" in result.reason
