"""Loading a trained artifact and turning one request into one recommendation.

Serving deliberately goes through the same ``FeatureVector`` and the same
``Pipeline`` the trainer produced. The preprocessing lives inside the artifact,
so there is no second copy of it here to drift out of sync.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .features import FEATURE_NAMES, INPUT_SCHEMA_VERSION, KNOWN_CROP_CODES, FeatureVector

# Confidence is capped this low when the request sits outside the training
# distribution. It is not a probability -- see the contract, §3.
OUT_OF_DISTRIBUTION_CONFIDENCE = 0.3


class ArtifactError(RuntimeError):
    """The artifact is missing, unreadable, or does not match this code."""


@dataclass(frozen=True)
class Prediction:
    volume_ml: int
    confidence: float
    imputed: tuple[str, ...]
    latency_ms: float


class IrrigationPredictor:
    def __init__(self, bundle: dict) -> None:
        self.pipeline = bundle["pipeline"]
        self.metadata: dict = bundle["metadata"]
        self.model_version: str = self.metadata["model_version"]
        self.feature_ranges: dict[str, tuple[float, float]] = self.metadata[
            "train_feature_ranges"
        ]
        self.trained_crops: set[str] = set(self.metadata.get("crop_codes", KNOWN_CROP_CODES))

        schema = self.metadata.get("input_schema_version")
        if schema != INPUT_SCHEMA_VERSION:
            raise ArtifactError(
                f"아티팩트 input_schema_version={schema}, 코드 기대값={INPUT_SCHEMA_VERSION}"
            )
        if tuple(self.metadata.get("feature_names", ())) != FEATURE_NAMES:
            raise ArtifactError("아티팩트 feature_names가 코드의 FEATURE_NAMES와 다릅니다")

    @classmethod
    def load(cls, path: str | Path) -> "IrrigationPredictor":
        artifact = Path(path)
        if not artifact.is_file():
            raise ArtifactError(f"모델 파일이 없습니다: {artifact}")
        try:
            bundle = joblib.load(artifact)
        except Exception as exc:  # noqa: BLE001 - surfaced as MODEL_UNAVAILABLE
            raise ArtifactError(f"모델을 읽을 수 없습니다: {exc}") from exc
        return cls(bundle)

    @property
    def loaded_at(self) -> str:
        return self.metadata.get(
            "trained_at", datetime.now(timezone.utc).isoformat()
        )

    def _frame(self, rows: list[list]) -> pd.DataFrame:
        return pd.DataFrame(rows, columns=list(FEATURE_NAMES))

    def _tree_spread(self, frame: pd.DataFrame) -> tuple[float, float]:
        """Mean and standard deviation across the forest's individual trees."""

        transformed = self.pipeline[:-1].transform(frame)
        forest = self.pipeline[-1]
        per_tree = np.array(
            [tree.predict(transformed)[0] for tree in forest.estimators_]
        )
        return float(per_tree.mean()), float(per_tree.std())

    def _is_out_of_distribution(self, vector: FeatureVector) -> bool:
        row = dict(zip(FEATURE_NAMES, vector.values))
        for name, (low, high) in self.feature_ranges.items():
            value = row.get(name)
            if value is None:
                continue
            if not low <= float(value) <= high:
                return True
        return str(row["crop_code"]) not in self.trained_crops

    def predict(self, payload: dict) -> Prediction:
        started = time.perf_counter()
        vector = FeatureVector.from_mapping(payload)
        frame = self._frame([vector.as_row()])

        mean, std = self._tree_spread(frame)
        confidence = float(np.clip(1.0 - std / max(mean, 1.0), 0.0, 1.0))
        if self._is_out_of_distribution(vector):
            confidence = min(confidence, OUT_OF_DISTRIBUTION_CONFIDENCE)

        # No clamping here. An out-of-range value must reach the backend intact
        # so it falls back and records the anomaly instead of quietly shipping a
        # plausible-looking number from a broken model (D15).
        return Prediction(
            volume_ml=int(round(mean)),
            confidence=round(confidence, 4),
            imputed=vector.imputed,
            latency_ms=round((time.perf_counter() - started) * 1000.0, 3),
        )

    def predict_batch(self, rows: list[list]) -> np.ndarray:
        """Straight pipeline prediction, used by the trainer's skew check."""

        return self.pipeline.predict(self._frame(rows))
