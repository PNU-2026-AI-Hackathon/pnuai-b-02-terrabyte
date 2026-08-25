from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import joblib
import pandas as pd
import pytest

from tools import train_irrigation_regressor as trainer


def _stamp(value: datetime) -> str:
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


@pytest.fixture
def dose_capture(tmp_path: Path) -> Path:
    capture = tmp_path / "campaign-20260825.jsonl"
    manifest = capture.with_suffix(".json")
    start = datetime(2026, 8, 1, tzinfo=timezone.utc)
    journal: list[dict[str, object]] = []

    for index in range(12):
        observed = start + timedelta(hours=index * 6)
        command_id = f"dose-{index:02d}"
        journal.extend(
            [
                {
                    "captured_at_utc": _stamp(observed),
                    "payload": {
                        "message_type": "telemetry",
                        "soil_moisture_pct": 38.0 - index,
                        "soil_temperature_c": 21.0,
                        "air_temperature_c": 24.0,
                        "relative_humidity_pct": 55.0,
                        "ppfd_umol_m2_s": 300.0,
                    },
                },
                {
                    "captured_at_utc": _stamp(observed + timedelta(minutes=1)),
                    "event": "command_sent",
                    "command": {"id": command_id, "ml": 40 + index},
                },
                {
                    "captured_at_utc": _stamp(
                        observed + timedelta(minutes=1, seconds=1)
                    ),
                    "payload": {"t": "ack", "id": command_id, "ph": "accepted"},
                },
                {
                    "captured_at_utc": _stamp(
                        observed + timedelta(minutes=1, seconds=42)
                    ),
                    "payload": {
                        "t": "ack",
                        "id": command_id,
                        "ph": "completed",
                        "ms": 40_000 + index * 1_000,
                        "ml": 40 + index,
                    },
                },
            ]
        )

    capture.write_text(
        "\n".join(json.dumps(row) for row in journal) + "\n",
        encoding="utf-8",
    )
    manifest.write_text(
        json.dumps(
            {
                "crop_code": "unknown",
                "substrate_volume_ml": 1_500,
                "flow_ml_per_s": 1.0,
            }
        ),
        encoding="utf-8",
    )
    return capture


def test_capture_and_samples_are_mutually_exclusive() -> None:
    with pytest.raises(SystemExit) as error:
        trainer.parse_arguments(["--capture", "campaign.jsonl", "--samples", "10"])

    assert error.value.code == 2


@pytest.mark.parametrize(
    ("keyword_arguments", "message"),
    [
        ({"substrate_volume_ml": 1_500}, "crop_code"),
        ({"crop_code": "unknown"}, "substrate_volume_ml"),
    ],
)
def test_capture_requires_crop_and_substrate(
    tmp_path: Path,
    keyword_arguments: dict[str, object],
    message: str,
) -> None:
    capture = tmp_path / "campaign.jsonl"

    with pytest.raises(trainer.CaptureDataError, match=message):
        trainer.load_capture_frame(capture, **keyword_arguments)


def test_capture_uses_chronological_split(dose_capture: Path) -> None:
    frame = trainer.load_capture_frame(dose_capture).frame

    train, validation, test, _ = trainer.split_training_frame(
        frame, capture=True, seed=42
    )

    assert frame["session_id"].nunique() == 1
    assert train.index.max() < validation.index.min() < test.index.min()
    assert len(train) == 8
    assert len(validation) == 2
    assert len(test) == 2


def test_synthetic_split_remains_grouped() -> None:
    frame = pd.DataFrame(
        {
            "session_id": [session for session in range(20) for _ in range(2)],
            "substrate_volume_ml": [1_500.0] * 40,
        }
    )

    train, validation, test, _ = trainer.split_training_frame(
        frame, capture=False, seed=42
    )

    train_sessions = set(train["session_id"])
    validation_sessions = set(validation["session_id"])
    test_sessions = set(test["session_id"])
    assert train_sessions.isdisjoint(validation_sessions)
    assert train_sessions.isdisjoint(test_sessions)
    assert validation_sessions.isdisjoint(test_sessions)


def test_small_capture_skips_meaningless_extrapolation(
    dose_capture: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    frame = trainer.load_capture_frame(dose_capture).frame

    *_, extrapolation = trainer.split_training_frame(frame, capture=True, seed=42)

    assert extrapolation.empty
    assert "외삽 평가 건너뜀" in capsys.readouterr().out


def test_label_provenance_and_warning_follow_actual_source(
    dose_capture: Path,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    capture_output = tmp_path / "capture.joblib"
    trainer.main(
        [
            "--capture",
            str(dose_capture),
            "--trees",
            "1",
            "--output",
            str(capture_output),
        ]
    )
    capture_stdout = capsys.readouterr().out
    capture_metadata = joblib.load(capture_output)["metadata"]

    assert capture_metadata["label_source"] == trainer.CAPTURE_LABEL_SOURCE
    assert capture_metadata["label_source"] != "synthetic-water-balance"
    assert "합성 데이터 경고" not in capture_stdout
    assert "실측 dose 캠페인 사용" in capture_stdout
    assert str(dose_capture) in capture_stdout

    synthetic_output = tmp_path / "synthetic.joblib"
    trainer.main(
        [
            "--samples",
            "200",
            "--trees",
            "1",
            "--output",
            str(synthetic_output),
        ]
    )
    synthetic_stdout = capsys.readouterr().out
    synthetic_metadata = joblib.load(synthetic_output)["metadata"]

    assert synthetic_metadata["label_source"] == "synthetic-water-balance"
    assert "합성 데이터 경고" in synthetic_stdout
    assert "실측 dose 캠페인 사용" not in synthetic_stdout
