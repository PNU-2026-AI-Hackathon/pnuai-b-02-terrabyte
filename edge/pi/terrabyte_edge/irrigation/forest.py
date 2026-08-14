"""Pure-Python random forest inference over an exported model artifact.

The forest is trained offline (``tools/train_irrigation_rf.py``) and exported as
plain arrays. Nothing here imports numpy, scikit-learn or xgboost, so the Orange
Pi runtime keeps its single ``pyserial`` dependency regardless of what hardware
the model was trained on.

Artifact schema (JSON)::

    {
      "model_version": "irrigation-rf-v1",
      "input_schema_version": 2,
      "feature_names": [...],
      "aggregation": "mean_probability" | "sum_logit",
      "base_score": 0.0,
      "decision_threshold": 0.5,
      "trees": [
        {
          "feature":        [int, ...],   # -1 on leaves
          "threshold":      [float, ...],
          "children_left":  [int, ...],   # -1 on leaves
          "children_right": [int, ...],
          "leaf":           [float, ...]  # only meaningful on leaves
        }
      ]
    }

Two trainers produce two leaf conventions, and the aggregation rule names which
one an artifact uses:

``mean_probability``
    Each leaf holds P(irrigate) for that leaf. The forest averages them. This is
    what scikit-learn and cuML random forests produce.
``sum_logit``
    Each leaf holds a raw margin. The forest sums them with ``base_score`` and
    applies a logistic. This is what XGBoost produces, including in its random
    forest mode.

Getting the split comparison wrong would be a silent train/serve skew, so the
export step re-scores training samples through this evaluator and refuses to
write an artifact that disagrees with the trainer.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Any, Sequence

from .features import FEATURE_NAMES, INPUT_SCHEMA_VERSION, IrrigationFeatures


DEFAULT_MODEL_PATH = Path(__file__).with_name("model") / "irrigation_rf_v1.json"

MEAN_PROBABILITY = "mean_probability"
SUM_LOGIT = "sum_logit"
AGGREGATIONS = (MEAN_PROBABILITY, SUM_LOGIT)

_LEAF = -1


class ModelError(ValueError):
    """Raised when an artifact is missing, malformed or schema-incompatible."""


@dataclass(frozen=True)
class RandomForestVote:
    """Raw classifier output, before any safety envelope is applied."""

    irrigate: bool
    probability: float
    model_version: str


@dataclass(frozen=True)
class _Tree:
    feature: tuple[int, ...]
    threshold: tuple[float, ...]
    children_left: tuple[int, ...]
    children_right: tuple[int, ...]
    leaf: tuple[float, ...]

    def output(self, vector: Sequence[float]) -> float:
        """Return this tree's leaf value for one sample.

        Both scikit-learn and XGBoost send ``x <= threshold`` to the left child,
        so a single traversal serves both.
        """

        node = 0
        while self.children_left[node] != _LEAF:
            if vector[self.feature[node]] <= self.threshold[node]:
                node = self.children_left[node]
            else:
                node = self.children_right[node]
        return self.leaf[node]


def _logistic(margin: float) -> float:
    # Split by sign so neither branch evaluates exp() on a large positive value.
    if margin >= 0.0:
        return 1.0 / (1.0 + math.exp(-margin))
    scaled = math.exp(margin)
    return scaled / (1.0 + scaled)


def _int_list(node: dict[str, Any], key: str) -> tuple[int, ...]:
    raw = node.get(key)
    if not isinstance(raw, list) or not raw:
        raise ModelError(f"tree.{key} must be a non-empty list")
    if any(isinstance(item, bool) or not isinstance(item, int) for item in raw):
        raise ModelError(f"tree.{key} must contain integers")
    return tuple(raw)


def _float_list(node: dict[str, Any], key: str) -> tuple[float, ...]:
    raw = node.get(key)
    if not isinstance(raw, list) or not raw:
        raise ModelError(f"tree.{key} must be a non-empty list")
    if any(isinstance(item, bool) or not isinstance(item, (int, float)) for item in raw):
        raise ModelError(f"tree.{key} must contain numbers")
    return tuple(float(item) for item in raw)


def _parse_tree(node: Any) -> _Tree:
    if not isinstance(node, dict):
        raise ModelError("each tree must be a JSON object")
    feature = _int_list(node, "feature")
    threshold = _float_list(node, "threshold")
    children_left = _int_list(node, "children_left")
    children_right = _int_list(node, "children_right")
    leaf = _float_list(node, "leaf")

    size = len(feature)
    if not (
        len(threshold) == len(children_left) == len(children_right) == len(leaf) == size
    ):
        raise ModelError("tree arrays must all have the same length")
    for index in range(size):
        left, right = children_left[index], children_right[index]
        if (left == _LEAF) != (right == _LEAF):
            raise ModelError("a node must have either two children or none")
        if left == _LEAF:
            continue
        if not (0 <= left < size) or not (0 <= right < size):
            raise ModelError("child index out of range")
        if left <= index or right <= index:
            raise ModelError("tree must be topologically ordered")
        if not 0 <= feature[index] < len(FEATURE_NAMES):
            raise ModelError("split feature index out of range")
    return _Tree(feature, threshold, children_left, children_right, leaf)


class RandomForestClassifier:
    """Forest inference over :class:`IrrigationFeatures`."""

    def __init__(
        self,
        trees: Sequence[_Tree],
        *,
        model_version: str,
        aggregation: str = MEAN_PROBABILITY,
        base_score: float = 0.0,
        decision_threshold: float = 0.5,
    ) -> None:
        if not trees:
            raise ModelError("model contains no trees")
        if aggregation not in AGGREGATIONS:
            raise ModelError(f"unsupported aggregation {aggregation!r}")
        if not 0.0 < decision_threshold < 1.0:
            raise ModelError("decision_threshold must be between 0 and 1")
        self._trees = tuple(trees)
        self.model_version = model_version
        self.aggregation = aggregation
        self.base_score = base_score
        self.decision_threshold = decision_threshold

    @property
    def tree_count(self) -> int:
        return len(self._trees)

    def probability(self, features: IrrigationFeatures) -> float:
        """Return P(irrigate) for one sample."""

        vector = features.to_vector()
        total = 0.0
        for tree in self._trees:
            total += tree.output(vector)

        if self.aggregation == MEAN_PROBABILITY:
            return total / len(self._trees)
        return _logistic(self.base_score + total)

    def predict(self, features: IrrigationFeatures) -> RandomForestVote:
        probability = self.probability(features)
        return RandomForestVote(
            irrigate=probability >= self.decision_threshold,
            probability=probability,
            model_version=self.model_version,
        )

    @classmethod
    def from_dict(cls, payload: Any) -> "RandomForestClassifier":
        if not isinstance(payload, dict):
            raise ModelError("model artifact must be a JSON object")

        schema = payload.get("input_schema_version")
        if schema != INPUT_SCHEMA_VERSION:
            raise ModelError(
                f"input_schema_version {schema!r} != {INPUT_SCHEMA_VERSION}"
            )
        names = payload.get("feature_names")
        if names != list(FEATURE_NAMES):
            raise ModelError("feature_names do not match the runtime contract")

        model_version = payload.get("model_version")
        if not isinstance(model_version, str) or not model_version:
            raise ModelError("model_version must be a non-empty string")

        raw_trees = payload.get("trees")
        if not isinstance(raw_trees, list) or not raw_trees:
            raise ModelError("trees must be a non-empty list")

        aggregation = payload.get("aggregation", MEAN_PROBABILITY)
        if aggregation not in AGGREGATIONS:
            raise ModelError(f"unsupported aggregation {aggregation!r}")

        base_score = payload.get("base_score", 0.0)
        if isinstance(base_score, bool) or not isinstance(base_score, (int, float)):
            raise ModelError("base_score must be a number")

        threshold = payload.get("decision_threshold", 0.5)
        if isinstance(threshold, bool) or not isinstance(threshold, (int, float)):
            raise ModelError("decision_threshold must be a number")

        return cls(
            [_parse_tree(tree) for tree in raw_trees],
            model_version=model_version,
            aggregation=aggregation,
            base_score=float(base_score),
            decision_threshold=float(threshold),
        )

    @classmethod
    def load(cls, path: Path | str | None = None) -> "RandomForestClassifier":
        """Load an artifact from disk.

        Raises :class:`ModelError` on any problem. Callers that must keep
        running without a model are expected to catch it and fall back to the
        deterministic rules alone.
        """

        target = Path(path) if path is not None else DEFAULT_MODEL_PATH
        try:
            text = target.read_text(encoding="utf-8")
        except OSError as exc:
            raise ModelError(f"cannot read model artifact at {target}") from exc
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ModelError("model artifact is not valid JSON") from exc
        return cls.from_dict(payload)
