#!/usr/bin/env python3
"""Train the irrigation volume regressor on synthetic or captured dose data.

    python tools/train_irrigation_regressor.py --samples 40000 --seed 42
    python tools/train_irrigation_regressor.py --capture campaign-20260825.jsonl

Produces ``models/irrigation_reg_v1.joblib``: a scikit-learn Pipeline with the
preprocessing embedded, plus the metadata the server needs to report its version
and detect out-of-distribution input.

Synthetic metrics measure recovery of the label formula. Capture metrics measure
reproduction of one campaign's delivered doses. Neither is a statement about
plants. See ``docs/design/ml_irrigation_contract.md`` §4.2.
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from terrabyte_ai.dataset import COLUMNS, generate  # noqa: E402
from terrabyte_ai.features import (  # noqa: E402
    CATEGORICAL_FEATURES,
    DEFAULTS,
    FEATURE_NAMES,
    FeatureError,
    FeatureVector,
    INPUT_SCHEMA_VERSION,
    NUMERIC_FEATURES,
    UNKNOWN_CROP,
)
from terrabyte_ai.predictor import IrrigationPredictor  # noqa: E402

MODEL_VERSION = "irrigation-reg-v1"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "models" / "irrigation_reg_v1.joblib"
DEFAULT_SAMPLES = 40000
CAPTURE_LABEL_SOURCE = "dose-campaign-flow-estimated-delivery"
PPFD_PER_LUX = 0.0185
MAX_HOURS_SINCE_IRRIGATION = 336.0

# Pots at or above this volume are held out entirely. In production the model
# will meet pot sizes it never trained on, and an in-distribution score hides
# how badly it extrapolates.
EXTRAPOLATION_VOLUME_ML = 6000.0

# Largest train/serve difference accepted as floating-point noise, in mL. Six
# orders of magnitude below the Governor's 20 mL minimum dose.
SKEW_TOLERANCE_ML = 1e-6

SYNTHETIC_WARNING = """
================================================================================
  ⚠  합성 데이터 경고
  라벨은 물수지 수식으로 생성됐다. 아래 점수는 모델이 그 수식을 얼마나 잘
  되찾았는지를 나타낼 뿐, 식물에 대해서는 아무것도 말해주지 않는다.
  발표·보고서에는 "파이프라인 검증 완료, 실측 데이터 확보는 진행 중"으로 쓸 것.
================================================================================
"""


class CaptureDataError(ValueError):
    """Raised when a dosing campaign cannot form honest training rows."""


@dataclass(frozen=True)
class CaptureTrainingData:
    frame: pd.DataFrame
    manifest_path: Path | None
    dropped_rows: int


@dataclass(frozen=True)
class _Telemetry:
    captured_at_utc: datetime
    session_id: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class _Command:
    captured_at_utc: datetime
    session_id: str
    requested_ml: float | None


@dataclass(frozen=True)
class _TerminalDose:
    captured_at_utc: datetime
    session_id: str
    command_id: str
    actual_runtime_ms: int


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="합성 물수지 데이터 또는 실측 dose 캡처로 관수량 회귀 모델을 학습합니다."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--capture",
        type=Path,
        help="dose_campaign.py가 기록한 실측 캠페인 JSONL",
    )
    source.add_argument(
        "--samples",
        type=int,
        help=f"합성 데이터 행 수 (기본값: {DEFAULT_SAMPLES})",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--trees", type=int, default=60)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--manifest",
        type=Path,
        help="캠페인 manifest JSON (기본값: capture와 같은 이름의 .json)",
    )
    parser.add_argument(
        "--crop-code",
        help="캠페인의 crop_code; 이 무식물 캠페인은 unknown만 허용",
    )
    parser.add_argument(
        "--substrate-volume-ml",
        type=float,
        help="캠페인 화분의 배지 용적(mL)",
    )
    parser.add_argument(
        "--dump-csv",
        type=Path,
        default=None,
        help="선택한 학습 데이터셋을 CSV로 저장 (저장소에 커밋하지 말 것 - D25)",
    )
    return parser


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = build_parser()
    arguments = parser.parse_args(argv)
    if arguments.capture is None and any(
        value is not None
        for value in (
            arguments.manifest,
            arguments.crop_code,
            arguments.substrate_volume_ml,
        )
    ):
        parser.error("--manifest, --crop-code, --substrate-volume-ml은 --capture와 함께 써야 합니다")
    if arguments.samples is not None and arguments.samples <= 0:
        parser.error("--samples는 양수여야 합니다")
    return arguments


def _parse_timestamp(value: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise CaptureDataError(f"유효하지 않은 captured_at_utc: {value!r}") from exc


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CaptureDataError(f"캠페인 manifest가 없습니다: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CaptureDataError(f"캠페인 manifest가 올바른 JSON이 아닙니다: {path}") from exc
    if not isinstance(payload, dict):
        raise CaptureDataError(f"캠페인 manifest는 JSON 객체여야 합니다: {path}")
    return payload


def _capture_context(
    capture_path: Path,
    manifest_argument: Path | None,
    crop_argument: str | None,
    substrate_argument: float | None,
) -> tuple[dict[str, Any], Path | None, str, float]:
    manifest_path = manifest_argument or capture_path.with_suffix(".json")
    if manifest_path.exists():
        manifest = _read_manifest(manifest_path)
    elif manifest_argument is not None:
        raise CaptureDataError(f"캠페인 manifest가 없습니다: {manifest_path}")
    else:
        manifest = {}
        manifest_path = None

    crop_code = crop_argument if crop_argument is not None else manifest.get("crop_code")
    if crop_code is None or str(crop_code).strip() == "":
        raise CaptureDataError(
            "캡처에는 crop_code가 없습니다. manifest 또는 --crop-code unknown을 지정하세요"
        )
    crop_code = str(crop_code)
    if crop_code != UNKNOWN_CROP:
        raise CaptureDataError(
            f"이 무식물 캠페인의 crop_code는 {UNKNOWN_CROP!r}이어야 합니다: {crop_code!r}"
        )

    raw_substrate = (
        substrate_argument
        if substrate_argument is not None
        else manifest.get("substrate_volume_ml")
    )
    substrate_volume_ml = _finite_number(raw_substrate)
    if substrate_volume_ml is None:
        raise CaptureDataError(
            "캡처에는 substrate_volume_ml가 없습니다. manifest 또는 "
            "--substrate-volume-ml을 지정하세요"
        )
    if substrate_volume_ml <= 0:
        raise CaptureDataError("substrate_volume_ml은 양수여야 합니다")

    return manifest, manifest_path, crop_code, substrate_volume_ml


def _session_name(number: int) -> str:
    return f"session-{number:04d}"


def _read_capture_journal(
    capture_path: Path,
) -> tuple[list[_Telemetry], dict[str, _Command], dict[str, datetime], list[_TerminalDose]]:
    if not capture_path.exists():
        raise CaptureDataError(f"캡처 파일이 없습니다: {capture_path}")

    telemetry: list[_Telemetry] = []
    commands: dict[str, _Command] = {}
    accepted_at: dict[str, datetime] = {}
    terminal_doses: list[_TerminalDose] = []
    session_number = 1
    previous_was_sensor = False

    for line_number, line in enumerate(
        capture_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            outer = json.loads(line)
        except json.JSONDecodeError:
            previous_was_sensor = False
            continue
        if not isinstance(outer, dict) or "captured_at_utc" not in outer:
            previous_was_sensor = False
            continue
        try:
            stamp = _parse_timestamp(outer["captured_at_utc"])
        except CaptureDataError as exc:
            raise CaptureDataError(f"{capture_path}:{line_number}: {exc}") from exc

        if outer.get("event") == "session_boundary":
            session_number += 1
            # dose_campaign records the reset-detecting sample immediately before
            # the boundary event, but that sample belongs to the new board session.
            if previous_was_sensor and telemetry:
                previous = telemetry[-1]
                telemetry[-1] = _Telemetry(
                    previous.captured_at_utc,
                    _session_name(session_number),
                    previous.payload,
                )
            previous_was_sensor = False
            continue

        if outer.get("event") == "command_sent":
            command = outer.get("command")
            if isinstance(command, dict) and isinstance(command.get("id"), str):
                commands[command["id"]] = _Command(
                    captured_at_utc=stamp,
                    session_id=_session_name(session_number),
                    requested_ml=_finite_number(command.get("ml")),
                )
            previous_was_sensor = False
            continue

        payload = outer.get("payload")
        if not isinstance(payload, dict):
            previous_was_sensor = False
            continue
        if payload.get("message_type") in {"telemetry", "sensor_status"}:
            telemetry.append(
                _Telemetry(stamp, _session_name(session_number), payload)
            )
            previous_was_sensor = True
            continue

        if payload.get("t") == "ack" and isinstance(payload.get("id"), str):
            command_id = payload["id"]
            phase = payload.get("ph")
            if phase == "accepted":
                accepted_at.setdefault(command_id, stamp)
            elif phase in {"completed", "aborted"}:
                runtime = payload.get("ms")
                if isinstance(runtime, int) and not isinstance(runtime, bool) and runtime >= 0:
                    terminal_doses.append(
                        _TerminalDose(
                            captured_at_utc=stamp,
                            session_id=_session_name(session_number),
                            command_id=command_id,
                            actual_runtime_ms=runtime,
                        )
                    )
        previous_was_sensor = False

    if not terminal_doses:
        raise CaptureDataError(f"완료 또는 중단된 dose가 캡처에 없습니다: {capture_path}")
    return telemetry, commands, accepted_at, terminal_doses


def _moisture_from_payload(
    payload: dict[str, Any], manifest: dict[str, Any]
) -> float | None:
    dry_adc = _finite_number(manifest.get("soil_moisture_dry_adc"))
    wet_adc = _finite_number(manifest.get("soil_moisture_wet_adc"))
    raw_adc = _finite_number(payload.get("soil_moisture_raw_adc"))
    if dry_adc is not None and wet_adc is not None and raw_adc is not None:
        if dry_adc == wet_adc:
            raise CaptureDataError("manifest의 토양 수분 dry/wet ADC 값은 서로 달라야 합니다")
        return (raw_adc - dry_adc) * 100.0 / (wet_adc - dry_adc)
    return _finite_number(payload.get("soil_moisture_pct"))


def load_capture_frame(
    capture_path: Path,
    *,
    manifest_path: Path | None = None,
    crop_code: str | None = None,
    substrate_volume_ml: float | None = None,
) -> CaptureTrainingData:
    """Turn dose-campaign records into the serving feature contract."""

    manifest, used_manifest, crop, substrate = _capture_context(
        capture_path, manifest_path, crop_code, substrate_volume_ml
    )
    flow_ml_per_s = _finite_number(manifest.get("flow_ml_per_s"))
    if flow_ml_per_s is None:
        flow_ml_per_s = 0.98
    if flow_ml_per_s <= 0:
        raise CaptureDataError("manifest의 flow_ml_per_s는 양수여야 합니다")

    telemetry, commands, accepted_at, terminal_doses = _read_capture_journal(capture_path)
    rows: list[dict[str, float | str]] = []
    timestamps: list[datetime] = []
    previous_dose_by_session: dict[str, datetime] = {}
    dropped = 0

    ordered_doses = sorted(
        terminal_doses,
        key=lambda item: accepted_at.get(
            item.command_id,
            commands.get(
                item.command_id,
                _Command(item.captured_at_utc, item.session_id, None),
            ).captured_at_utc,
        ),
    )
    for dose in ordered_doses:
        command = commands.get(dose.command_id)
        session_id = command.session_id if command is not None else dose.session_id
        dosed_at = accepted_at.get(
            dose.command_id,
            command.captured_at_utc if command is not None else dose.captured_at_utc,
        )
        pre_dose = [
            sample
            for sample in telemetry
            if sample.session_id == session_id and sample.captured_at_utc <= dosed_at
        ]
        if not pre_dose or dose.actual_runtime_ms <= 0:
            dropped += 1
            continue
        payload = pre_dose[-1].payload
        moisture = _moisture_from_payload(payload, manifest)
        air_temperature = _finite_number(payload.get("air_temperature_c"))
        humidity = _finite_number(payload.get("relative_humidity_pct"))
        if moisture is None or air_temperature is None or humidity is None:
            dropped += 1
            continue

        ppfd = _finite_number(payload.get("ppfd_umol_m2_s"))
        if ppfd is None:
            lux = _finite_number(payload.get("illuminance_lux"))
            ppfd = float(DEFAULTS["plant_light_ppfd_umol_m2_s"]) if lux is None else lux * PPFD_PER_LUX
        soil_temperature = _finite_number(payload.get("soil_temperature_c"))
        if soil_temperature is None:
            soil_temperature = float(DEFAULTS["soil_temperature_c"])
        previous_dose = previous_dose_by_session.get(session_id)
        hours_since = (
            MAX_HOURS_SINCE_IRRIGATION
            if previous_dose is None
            else min(
                MAX_HOURS_SINCE_IRRIGATION,
                max(0.0, (dosed_at - previous_dose).total_seconds() / 3600.0),
            )
        )
        previous_dose_by_session[session_id] = dosed_at

        mapping: dict[str, float | str] = {
            "soil_moisture_pct": moisture,
            "soil_temperature_c": soil_temperature,
            "air_temperature_c": air_temperature,
            "air_humidity_pct": humidity,
            "plant_light_ppfd_umol_m2_s": ppfd,
            "hours_since_last_irrigation": hours_since,
            "substrate_volume_ml": substrate,
            "crop_code": crop,
        }
        try:
            vector = FeatureVector.from_mapping(mapping)
        except FeatureError:
            dropped += 1
            continue
        row = dict(zip(FEATURE_NAMES, vector.values))
        row["session_id"] = session_id
        row["volume_ml"] = flow_ml_per_s * dose.actual_runtime_ms / 1000.0
        rows.append(row)
        timestamps.append(dosed_at)

    if not rows:
        raise CaptureDataError("캡처에서 유효한 회귀 학습 행을 만들지 못했습니다")
    frame = pd.DataFrame(
        rows,
        columns=list(FEATURE_NAMES) + ["session_id", "volume_ml"],
        index=pd.DatetimeIndex(timestamps, name="dosed_at_utc"),
    ).sort_index(kind="stable")
    return CaptureTrainingData(frame, used_manifest, dropped)


def print_capture_banner(
    capture_path: Path, data: CaptureTrainingData
) -> None:
    print(
        "\n".join(
            [
                "=" * 80,
                "  ⚠  실측 dose 캠페인 사용",
                f"  캡처: {capture_path}",
                "  한 화분에서 저울 없이 수집한 용량-반응 기록입니다. 물리 상수 보정의",
                "  근거는 될 수 있지만, 회귀 모델을 최적 관수량 실측 정답으로 재학습했다는",
                "  뜻은 아닙니다. 라벨은 펌프 구동시간과 유량으로 추정한 전달량입니다.",
                f"  사용 행: {len(data.frame)}건, 제외 행: {data.dropped_rows}건",
                "=" * 80,
            ]
        )
    )


def build_pipeline(trees: int, seed: int) -> Pipeline:
    """Preprocessing is embedded so train and serve cannot diverge."""

    preprocess = ColumnTransformer(
        transformers=[
            ("crop", OneHotEncoder(handle_unknown="ignore"), list(CATEGORICAL_FEATURES)),
            ("numeric", "passthrough", list(NUMERIC_FEATURES)),
        ]
    )
    forest = RandomForestRegressor(
        n_estimators=trees,
        # Deeper trees (leaf=4) buy ~1.8 mL of MAE and cost 8x the artifact size
        # (16 MB vs 2 MB). 1.8 mL is an order of magnitude below the Governor's
        # 20 mL minimum dose, so it cannot change a single irrigation decision,
        # and the artifact is committed to the repository.
        min_samples_leaf=16,
        n_jobs=-1,
        random_state=seed,
    )
    return Pipeline([("preprocess", preprocess), ("model", forest)])


def over_prediction_rate(true: np.ndarray, predicted: np.ndarray) -> float:
    """Share of predictions exceeding truth by more than 50 %.

    Under-watering is corrected on the next cycle; over-watering is not
    reversible. Two models with equal MAE are not equally safe.
    """

    return float(np.mean(predicted > true * 1.5))


def report(name: str, true: np.ndarray, predicted: np.ndarray) -> dict:
    metrics = {
        "mae_ml": float(mean_absolute_error(true, predicted)),
        "rmse_ml": float(np.sqrt(mean_squared_error(true, predicted))),
        "r2": float(r2_score(true, predicted)),
        "over_prediction_rate": over_prediction_rate(true, predicted),
        "rows": int(len(true)),
    }
    print(
        f"{name:<22} MAE {metrics['mae_ml']:7.2f} mL   "
        f"RMSE {metrics['rmse_ml']:7.2f} mL   "
        f"R2 {metrics['r2']:6.3f}   "
        f"과다예측률 {metrics['over_prediction_rate'] * 100:5.2f}%   "
        f"n={metrics['rows']}"
    )
    return metrics


def verify_no_skew(pipeline: Pipeline, predictor: IrrigationPredictor, frame: pd.DataFrame) -> None:
    """The trainer's pipeline and the server's load path must agree exactly.

    A mismatch here means the artifact does not carry everything serving needs,
    which is the failure mode that silently ships wrong volumes.
    """

    rows = frame[list(FEATURE_NAMES)].head(100).values.tolist()
    direct = pipeline.predict(pd.DataFrame(rows, columns=list(FEATURE_NAMES)))
    served = predictor.predict_batch(rows)

    worst = float(np.max(np.abs(direct - served)))
    # Not bit-identical: the forest sums tree outputs across a thread pool, so
    # the accumulation order varies between calls. That noise is ~1e-14 mL.
    # Anything above the tolerance means the artifact lost preprocessing or
    # feature order, which is the failure this check exists to catch.
    if worst > SKEW_TOLERANCE_ML:
        raise SystemExit(f"train/serve skew 감지: 최대 차이 {worst} mL")
    print(f"skew 검증           통과 ({len(rows)}건, 최대 차이 {worst:.2e} mL)")


def split_training_frame(
    frame: pd.DataFrame, *, capture: bool, seed: int
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    # Hold out the largest pots entirely, then split the rest by session.
    extrapolation = frame[frame["substrate_volume_ml"] >= EXTRAPOLATION_VOLUME_ML]
    pool = frame[frame["substrate_volume_ml"] < EXTRAPOLATION_VOLUME_ML]

    if capture:
        if extrapolation.empty:
            print(
                "외삽 평가 건너뜀    캡처에 6 L 이상 배지가 없어 "
                "의미 있는 외삽 점수를 만들 수 없습니다"
            )
        elif pool.empty:
            raise CaptureDataError(
                "모든 캡처 행이 6 L 이상 배지라 학습 풀이 비었습니다. "
                "의미 없는 외삽 평가를 거부합니다"
            )
        if len(pool) < 7:
            raise CaptureDataError(
                "시간순 train/validation/test 분할에는 유효한 dose가 최소 7건 필요합니다"
            )

        # A campaign has one pot, so grouping by session either puts every row
        # on one side or pretends correlated rows are independent. Preserve
        # causality instead: learn from earlier doses and evaluate on later ones.
        pool = pool.sort_index(kind="stable")
        train_end = int(len(pool) * 0.70)
        if len(pool) - train_end < 4:
            train_end = len(pool) - 4
        validation_size = (len(pool) - train_end) // 2
        validation_end = train_end + validation_size
        train = pool.iloc[:train_end]
        validation = pool.iloc[train_end:validation_end]
        test = pool.iloc[validation_end:]
        print(
            f"분할                 train={len(train)} val={len(validation)} "
            f"test={len(test)} 외삽={len(extrapolation)} "
            "(단일 화분 dose 시간순 70/15/15)"
        )
        return train, validation, test, extrapolation

    # Synthetic sessions model different pots. Keep this grouped split exactly:
    # row-wise splitting would leak neighbouring hours of the same simulated pot.
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.30, random_state=seed)
    train_index, holdout_index = next(
        splitter.split(pool, groups=pool["session_id"])
    )
    train = pool.iloc[train_index]
    holdout = pool.iloc[holdout_index]

    # Split the 30 % holdout evenly into validation and test.
    inner = GroupShuffleSplit(n_splits=1, test_size=0.50, random_state=seed)
    validation_index, test_index = next(
        inner.split(holdout, groups=holdout["session_id"])
    )
    validation = holdout.iloc[validation_index]
    test = holdout.iloc[test_index]

    print(
        f"분할                 train={len(train)} val={len(validation)} "
        f"test={len(test)} 외삽={len(extrapolation)} "
        f"(세션 단위 GroupShuffleSplit)"
    )
    return train, validation, test, extrapolation


def dump_frame_csv(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(COLUMNS)
        writer.writerows(frame.loc[:, list(COLUMNS)].itertuples(index=False, name=None))
    print(f"CSV 저장             {path}")


def main(argv: Sequence[str] | None = None) -> None:
    arguments = parse_arguments(argv)
    is_capture = arguments.capture is not None
    capture_data: CaptureTrainingData | None = None

    if is_capture:
        try:
            capture_data = load_capture_frame(
                arguments.capture,
                manifest_path=arguments.manifest,
                crop_code=arguments.crop_code,
                substrate_volume_ml=arguments.substrate_volume_ml,
            )
        except CaptureDataError as exc:
            raise SystemExit(f"캡처 오류: {exc}") from exc
        frame = capture_data.frame
        label_source = CAPTURE_LABEL_SOURCE
        print_capture_banner(arguments.capture, capture_data)
        print(f"캡처 로드            rows={len(frame)} seed={arguments.seed}")
    else:
        samples = arguments.samples if arguments.samples is not None else DEFAULT_SAMPLES
        print(SYNTHETIC_WARNING)
        print(f"데이터 생성          samples={samples} seed={arguments.seed}")
        data = generate(samples, arguments.seed)
        frame = pd.DataFrame({name: data.features[name] for name in FEATURE_NAMES})
        frame["session_id"] = data.session_ids
        frame["volume_ml"] = data.volume_ml
        label_source = "synthetic-water-balance"

    if arguments.dump_csv:
        dump_frame_csv(frame, arguments.dump_csv)

    try:
        train, validation, test, extrapolation = split_training_frame(
            frame, capture=is_capture, seed=arguments.seed
        )
    except CaptureDataError as exc:
        raise SystemExit(f"캡처 오류: {exc}") from exc

    pipeline = build_pipeline(arguments.trees, arguments.seed)
    pipeline.fit(train[list(FEATURE_NAMES)], train["volume_ml"])
    print()

    metrics = {
        "train": report("학습", train["volume_ml"].values, pipeline.predict(train[list(FEATURE_NAMES)])),
        "validation": report(
            "검증", validation["volume_ml"].values, pipeline.predict(validation[list(FEATURE_NAMES)])
        ),
        "test": report("테스트", test["volume_ml"].values, pipeline.predict(test[list(FEATURE_NAMES)])),
    }
    if len(extrapolation):
        metrics["extrapolation"] = report(
            "외삽(6L 이상)",
            extrapolation["volume_ml"].values,
            pipeline.predict(extrapolation[list(FEATURE_NAMES)]),
        )
    print()

    # Ranges come from the training split only: anything the model did not see
    # during fitting is out of distribution at serving time.
    train_ranges = {
        name: (float(train[name].min()), float(train[name].max()))
        for name in NUMERIC_FEATURES
    }

    source_metadata: dict[str, Any]
    if is_capture:
        assert capture_data is not None
        source_metadata = {
            "dataset_samples": len(frame),
            "capture_file": str(arguments.capture),
            "campaign_manifest": (
                str(capture_data.manifest_path)
                if capture_data.manifest_path is not None
                else None
            ),
        }
    else:
        source_metadata = {
            "dataset_seed": arguments.seed,
            "dataset_samples": len(frame),
        }

    bundle = {
        "pipeline": pipeline,
        "metadata": {
            "model_version": MODEL_VERSION,
            "input_schema_version": INPUT_SCHEMA_VERSION,
            "feature_names": list(FEATURE_NAMES),
            "crop_codes": sorted(train["crop_code"].unique().tolist()),
            "train_feature_ranges": train_ranges,
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            **source_metadata,
            "label_source": label_source,
            "metrics": metrics,
        },
    }

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, arguments.output, compress=3)
    print(f"아티팩트 저장        {arguments.output}")

    verify_no_skew(pipeline, IrrigationPredictor.load(arguments.output), test)
    if not is_capture:
        print(SYNTHETIC_WARNING)


if __name__ == "__main__":
    main()
