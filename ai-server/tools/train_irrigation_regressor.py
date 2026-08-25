#!/usr/bin/env python3
"""Train the irrigation volume regressor on synthetic water-balance data.

    python tools/train_irrigation_regressor.py --samples 40000 --seed 42

Produces ``models/irrigation_reg_v1.joblib``: a scikit-learn Pipeline with the
preprocessing embedded, plus the metadata the server needs to report its version
and detect out-of-distribution input.

The reported metrics measure how well the model recovers the formula that
generated the labels. They are not a statement about plants. See
``docs/design/ml_irrigation_contract.md`` §4.2.
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

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
    FEATURE_NAMES,
    INPUT_SCHEMA_VERSION,
    NUMERIC_FEATURES,
)
from terrabyte_ai.predictor import IrrigationPredictor  # noqa: E402

MODEL_VERSION = "irrigation-reg-v1"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "models" / "irrigation_reg_v1.joblib"

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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=40000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--trees", type=int, default=60)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--dump-csv",
        type=Path,
        default=None,
        help="생성한 데이터셋을 CSV로 저장 (저장소에 커밋하지 말 것 — D25)",
    )
    arguments = parser.parse_args()

    print(SYNTHETIC_WARNING)
    print(f"데이터 생성          samples={arguments.samples} seed={arguments.seed}")
    data = generate(arguments.samples, arguments.seed)

    frame = pd.DataFrame({name: data.features[name] for name in FEATURE_NAMES})
    frame["session_id"] = data.session_ids
    frame["volume_ml"] = data.volume_ml

    if arguments.dump_csv:
        arguments.dump_csv.parent.mkdir(parents=True, exist_ok=True)
        with arguments.dump_csv.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(COLUMNS)
            writer.writerows(data.to_rows())
        print(f"CSV 저장             {arguments.dump_csv}")

    # Hold out the largest pots entirely, then split the rest by session.
    extrapolation = frame[frame["substrate_volume_ml"] >= EXTRAPOLATION_VOLUME_ML]
    pool = frame[frame["substrate_volume_ml"] < EXTRAPOLATION_VOLUME_ML]

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.30, random_state=arguments.seed)
    train_index, holdout_index = next(
        splitter.split(pool, groups=pool["session_id"])
    )
    train = pool.iloc[train_index]
    holdout = pool.iloc[holdout_index]

    # Split the 30 % holdout evenly into validation and test.
    inner = GroupShuffleSplit(n_splits=1, test_size=0.50, random_state=arguments.seed)
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

    bundle = {
        "pipeline": pipeline,
        "metadata": {
            "model_version": MODEL_VERSION,
            "input_schema_version": INPUT_SCHEMA_VERSION,
            "feature_names": list(FEATURE_NAMES),
            "crop_codes": sorted(train["crop_code"].unique().tolist()),
            "train_feature_ranges": train_ranges,
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "dataset_seed": arguments.seed,
            "dataset_samples": arguments.samples,
            "label_source": "synthetic-water-balance",
            "metrics": metrics,
        },
    }

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, arguments.output, compress=3)
    print(f"아티팩트 저장        {arguments.output}")

    verify_no_skew(pipeline, IrrigationPredictor.load(arguments.output), test)
    print(SYNTHETIC_WARNING)


if __name__ == "__main__":
    main()
