"""Train the edge irrigation random forest and export a runtime artifact.

Run offline (developer machine or CI), never on the Orange Pi::

    python -m venv .venv && .venv/bin/pip install -r tools/requirements-train.txt
    .venv/bin/python tools/train_irrigation_rf.py

There are two possible sources of training data, and they are not equivalent.

**Bench captures (preferred, and the default).** ``data/raw/*.csv`` produced by
the dataset logger firmware. The label is behavioural: *did the operator water
this pot within the next 6 hours?* The forest is then learning a watering
decision, which is the thing worth predicting.

**The physics generator (fallback, only when no capture exists).** Samples are
labelled by projecting a soil water balance forward and testing it against a
stress threshold. This is a much weaker exercise, because the label *is* the
formula: the best the forest can do is rediscover the equation it was handed,
and its accuracy measures curve-fitting rather than anything about plants. It
exists so the pipeline can run before any pot is instrumented.

Either way, a model trained on generated data is trusted only inside the
deterministic envelope in ``irrigation/decision.py``. A capture file that is
itself fabricated (``tools/make_bench_capture.py``) improves the shape of the
learning problem, not the truth of the data — the banner in the file and the
warning printed here both say so.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import numpy as np
from sklearn.ensemble import RandomForestClassifier as SklearnForest
from sklearn.metrics import accuracy_score, confusion_matrix, roc_auc_score
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from capture_dataset_loader import load_capture  # noqa: E402

from terrabyte_edge.irrigation.features import (  # noqa: E402
    FEATURE_NAMES,
    INPUT_SCHEMA_VERSION,
    IrrigationFeatures,
)
from terrabyte_edge.irrigation.forest import (  # noqa: E402
    DEFAULT_MODEL_PATH,
    RandomForestClassifier,
)


MODEL_VERSION = "irrigation-rf-v1"

# Soil moisture (%) below which the crop is considered water-stressed.
STRESS_THRESHOLD_PCT = 25.0
# Hours the pot must survive unattended: the 6 h envelope interval plus margin
# for a missed cycle. Short horizons make the label collapse onto a plain soil
# moisture threshold and the other five features stop carrying signal.
HORIZON_HOURS = 12.0
# Fraction of labels flipped so the forest cannot memorise a noiseless boundary.
LABEL_NOISE = 0.02


def evapotranspiration_pct_per_hour(
    soil_moisture_pct: np.ndarray,
    soil_temperature_c: np.ndarray,
    air_temperature_c: np.ndarray,
    relative_humidity_pct: np.ndarray,
    ppfd_umol_m2_s: np.ndarray,
) -> np.ndarray:
    """Soil moisture loss rate in percentage points per hour."""

    vapour_deficit = np.clip(1.0 - relative_humidity_pct / 100.0, 0.05, 1.0)
    light = 0.30 + ppfd_umol_m2_s / 800.0
    warmth = np.clip(1.0 + 0.045 * (air_temperature_c - 20.0), 0.2, 3.0)
    # Root uptake peaks near 22 C and falls off in cold or hot soil.
    roots = np.clip(1.0 - np.abs(soil_temperature_c - 22.0) / 30.0, 0.2, 1.0)
    # A dry soil gives up water more slowly than a wet one.
    availability = np.clip(soil_moisture_pct / 40.0, 0.25, 1.2)
    # Scaled so a small indoor pot loses roughly 10-15 percentage points per day
    # under typical light and warmth, and far more under bright dry conditions.
    # Below this scale the horizon projection barely moves and the label
    # degenerates into a plain soil moisture threshold.
    return 3.5 * vapour_deficit * light * warmth * roots * availability


def generate_dataset(
    samples: int, seed: int
) -> tuple[np.ndarray, np.ndarray]:
    """Sample plausible pot states and label them by projected water stress."""

    rng = np.random.default_rng(seed)

    soil_moisture = rng.uniform(4.0, 62.0, samples)
    soil_temperature = np.clip(rng.normal(20.0, 5.0, samples), 2.0, 40.0)
    air_temperature = np.clip(rng.normal(23.0, 6.0, samples), -5.0, 45.0)
    humidity = np.clip(rng.normal(55.0, 18.0, samples), 5.0, 100.0)

    # Indoor light is bimodal: photoperiod on or off.
    daytime = rng.random(samples) < 0.55
    ppfd = np.where(
        daytime,
        np.clip(rng.normal(420.0, 220.0, samples), 0.0, 1400.0),
        rng.uniform(0.0, 25.0, samples),
    )
    hours_since = rng.uniform(0.0, 72.0, samples)

    rate = evapotranspiration_pct_per_hour(
        soil_moisture, soil_temperature, air_temperature, humidity, ppfd
    )
    # Measurement and substrate variability the deterministic model cannot see.
    rate = rate * np.clip(rng.normal(1.0, 0.12, samples), 0.4, 1.8)

    # A pot watered very recently still has water redistributing downward.
    redistribution = 1.4 * np.exp(-hours_since / 3.0)
    projected = soil_moisture + redistribution - rate * HORIZON_HOURS

    labels = (projected < STRESS_THRESHOLD_PCT).astype(np.int64)
    flip = rng.random(samples) < LABEL_NOISE
    labels[flip] = 1 - labels[flip]

    features = np.column_stack(
        [
            soil_moisture,
            soil_temperature,
            air_temperature,
            humidity,
            ppfd,
            hours_since,
        ]
    )
    return features, labels


def train_sklearn(train_x: np.ndarray, train_y: np.ndarray, arguments):
    """CPU random forest. The default, and enough for a dataset this size."""

    forest = SklearnForest(
        n_estimators=arguments.trees,
        max_depth=arguments.max_depth,
        min_samples_leaf=arguments.min_samples_leaf,
        class_weight="balanced",
        random_state=arguments.seed,
        n_jobs=-1,
    )
    forest.fit(train_x, train_y)
    return (
        forest,
        lambda matrix: forest.predict_proba(matrix)[:, 1],
        forest.feature_importances_,
    )


def train_xgboost(train_x: np.ndarray, train_y: np.ndarray, arguments):
    """GPU-capable random forest via XGBoost's parallel-tree mode.

    This is a random forest, not boosting: a single round grows
    ``num_parallel_tree`` independent trees, with per-tree row and per-node
    column subsampling. ``device="cuda"`` moves histogram construction to the
    GPU; the exported artifact is identical in form either way.

    Chosen over RAPIDS cuML because it installs with plain pip on native
    Windows, whereas cuML needs WSL2 there.
    """

    try:
        import xgboost as xgb
    except ImportError:  # pragma: no cover - operator-facing tool
        raise SystemExit(
            "xgboost is not installed: pip install -r tools/requirements-train.txt"
        )

    positive = float((train_y == 1).sum())
    negative = float((train_y == 0).sum())
    if positive == 0.0:
        raise SystemExit("training split contains no positive samples")

    model = xgb.XGBClassifier(
        n_estimators=1,
        num_parallel_tree=arguments.trees,
        max_depth=arguments.max_depth,
        min_child_weight=arguments.min_samples_leaf,
        learning_rate=1.0,
        subsample=0.8,
        colsample_bynode=0.8,
        # Mirrors class_weight="balanced" in the sklearn backend.
        scale_pos_weight=negative / positive,
        tree_method="hist",
        device=arguments.device,
        random_state=arguments.seed,
        base_score=0.5,
    )
    model.fit(train_x, train_y, verbose=False)

    booster = model.get_booster()
    # XGBoost sums raw margins onto the logit of base_score.
    base_score = math.log(0.5 / (1.0 - 0.5))

    importances = np.zeros(len(FEATURE_NAMES), dtype=np.float64)
    for name, gain in booster.get_score(importance_type="gain").items():
        importances[_feature_index(name)] = gain
    total = importances.sum()
    if total > 0.0:
        importances /= total

    return (
        booster,
        lambda matrix: model.predict_proba(matrix)[:, 1],
        importances,
        base_score,
    )


def export_sklearn(forest, decision_threshold: float) -> dict:
    """Flatten scikit-learn's trees into the runtime artifact schema."""

    trees = []
    for estimator in forest.estimators_:
        tree = estimator.tree_
        # value has shape (n_nodes, 1, n_classes), normalised per node, with
        # classes ordered [no-irrigate, irrigate]. Column 1 is P(irrigate).
        positive = tree.value[:, 0, 1]
        trees.append(
            {
                "feature": [int(index) for index in tree.feature],
                "threshold": [float(item) for item in tree.threshold],
                "children_left": [int(index) for index in tree.children_left],
                "children_right": [int(index) for index in tree.children_right],
                "leaf": [float(item) for item in positive],
            }
        )
    return {
        "model_version": MODEL_VERSION,
        "input_schema_version": INPUT_SCHEMA_VERSION,
        "feature_names": list(FEATURE_NAMES),
        "aggregation": "mean_probability",
        "base_score": 0.0,
        "decision_threshold": decision_threshold,
        "trees": trees,
    }


def _feature_index(name: str) -> int:
    """Resolve an XGBoost split name to a runtime feature position.

    Trained on a bare numpy array, XGBoost names columns positionally (``f0``,
    ``f1``, ...); trained on named data it echoes the real names. Both are
    accepted so the export does not silently depend on how ``fit`` was called.
    """

    if name in FEATURE_NAMES:
        return FEATURE_NAMES.index(name)
    if name.startswith("f") and name[1:].isdigit():
        index = int(name[1:])
        if 0 <= index < len(FEATURE_NAMES):
            return index
    raise SystemExit(f"xgboost split on unknown feature {name!r}")


def _flatten_xgboost_tree(tree: dict) -> dict:
    """Convert one tree from XGBoost's saved model into the runtime schema.

    The saved model already stores flat, topologically ordered arrays, and its
    split values keep full precision. ``booster.get_dump()`` is deliberately not
    used: it renders split conditions as shortened decimal text, which shifts a
    threshold by enough to route samples near it down the wrong branch.

    Two conversions are required and neither is optional:

    * **Narrow each split back to float32.** XGBoost holds splits as float32 but
      serialises them as the shortest decimal that round-trips *as float32*, so
      ``23.38999939`` is written ``23.39``. Reading that as a double yields a
      threshold slightly above the real one, and any sample sitting exactly on
      the split then takes the wrong branch — which is common here, since the
      splits are drawn from the training values themselves.
    * **Nudge down one ulp.** XGBoost sends ``x < split`` to the left child
      whereas the runtime uses ``x <= threshold``, and
      ``x <= nextafter(split, -inf)`` is exactly equivalent to ``x < split``.
    """

    left = [int(index) for index in tree["left_children"]]
    right = [int(index) for index in tree["right_children"]]
    split_indices = [int(index) for index in tree["split_indices"]]
    split_conditions = [
        float(np.float32(value)) for value in tree["split_conditions"]
    ]

    feature: list[int] = []
    threshold: list[float] = []
    leaf: list[float] = []
    for node in range(len(left)):
        if left[node] == -1:
            # On a leaf, split_conditions carries the output margin.
            feature.append(-1)
            threshold.append(0.0)
            leaf.append(split_conditions[node])
            continue
        index = split_indices[node]
        if not 0 <= index < len(FEATURE_NAMES):
            raise SystemExit(f"xgboost split on unknown feature index {index}")
        feature.append(index)
        threshold.append(math.nextafter(split_conditions[node], float("-inf")))
        leaf.append(0.0)

    return {
        "feature": feature,
        "threshold": threshold,
        "children_left": left,
        "children_right": right,
        "leaf": leaf,
    }


def export_xgboost(booster, base_score: float, decision_threshold: float) -> dict:
    """Flatten an XGBoost random forest into the runtime artifact schema."""

    import json as _json
    import tempfile

    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "model.json"
        booster.save_model(str(path))
        payload = _json.loads(path.read_text(encoding="utf-8"))

    model = payload["learner"]["gradient_booster"]["model"]
    trees = [_flatten_xgboost_tree(tree) for tree in model["trees"]]
    return {
        "model_version": MODEL_VERSION,
        "input_schema_version": INPUT_SCHEMA_VERSION,
        "feature_names": list(FEATURE_NAMES),
        "aggregation": "sum_logit",
        "base_score": base_score,
        "decision_threshold": decision_threshold,
        "trees": trees,
    }


def verify_no_skew(
    artifact: dict,
    samples: np.ndarray,
    expected: np.ndarray,
    tolerance: float,
) -> None:
    """Re-score every sample through the runtime evaluator.

    A mismatch means the exported artifact and scikit-learn disagree, which
    would be invisible at runtime. Refuse to write the artifact in that case.

    ``samples`` is pre-rounded to float32 because scikit-learn casts inputs to
    float32 before traversing a tree, while the runtime evaluator compares in
    float64. Without the cast the two disagree on samples sitting within float32
    epsilon of a split threshold. That residual difference is real but bounded:
    it can only flip a sample that is already numerically on a decision boundary.
    """

    runtime = RandomForestClassifier.from_dict(artifact)
    samples = samples.astype(np.float32).astype(np.float64)
    for row, reference in zip(samples, expected):
        features = IrrigationFeatures(
            soil_moisture_pct=float(row[0]),
            soil_temperature_c=float(row[1]),
            air_temperature_c=float(row[2]),
            relative_humidity_pct=float(row[3]),
            ppfd_umol_m2_s=float(row[4]),
            hours_since_last_irrigation=float(row[5]),
        )
        actual = runtime.probability(features)
        if abs(actual - float(reference)) > tolerance:
            raise SystemExit(
                "train/serve skew: runtime evaluator returned "
                f"{actual!r}, scikit-learn returned {float(reference)!r}"
            )


def load_from_captures(
    paths: list[Path], decimate_minutes: int
) -> tuple[np.ndarray, np.ndarray, int, str]:
    """Load capture files and choose an honest evaluation split.

    Never a random split. Rows a minute apart are near-duplicates, so shuffling
    would put a row's own neighbours on the other side of the split and report
    an accuracy that cannot survive deployment.

    With several pots available the last one is held out whole, which asks the
    only question that matters for a product: does this work on a pot the model
    has never seen, with a different substrate and a different owner's habits? A
    single capture can only be split chronologically, which is weaker — the test
    rows come from the same pot the model trained on.
    """

    per_pot = [
        load_capture(path, decimate_minutes=decimate_minutes) for path in paths
    ]
    rows: list[list[float]] = []
    labels_list: list[int] = []
    dropped = 0
    events = 0
    synthetic = False
    for capture in per_pot:
        rows.extend(capture.rows)
        labels_list.extend(capture.labels)
        dropped += capture.dropped
        events += capture.irrigation_events
        synthetic = synthetic or capture.synthetic

    features = np.asarray(rows, dtype=np.float64)
    labels = np.asarray(labels_list, dtype=np.int64)

    print(f"captures      : {len(paths)} file(s), {len(features)} usable rows")
    print(f"irrigations   : {events} operator events")
    print(f"dropped rows  : {dropped} (invalid or before first watering)")
    if synthetic:
        print(
            "SOURCE        : SYNTHETIC capture — fabricated, not measured. "
            "Any figure below describes the generator, not a real pot."
        )

    if len(per_pot) > 1:
        split = len(features) - len(per_pot[-1].rows)
        description = (
            f"held-out pot ({paths[-1].name}), "
            f"{len(per_pot) - 1} pot(s) for training"
        )
    else:
        split = int(len(features) * 0.75)
        description = "chronological 75/25 within one pot (weak: same pot)"
    return features, labels, split, description


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--capture",
        type=Path,
        nargs="*",
        help="bench capture CSV files; omit to fall back to the physics generator",
    )
    parser.add_argument("--decimate-minutes", type=int, default=10)
    parser.add_argument("--samples", type=int, default=40_000)
    parser.add_argument("--seed", type=int, default=20260814)
    parser.add_argument(
        "--backend",
        choices=("sklearn", "xgboost"),
        default="sklearn",
        help="sklearn is CPU-only; xgboost supports --device cuda",
    )
    parser.add_argument(
        "--device",
        default="cpu",
        help="xgboost only: cpu or cuda (RTX/NVIDIA)",
    )
    parser.add_argument("--trees", type=int, default=25)
    parser.add_argument("--min-samples-leaf", type=int, default=25)
    parser.add_argument("--max-depth", type=int, default=7)
    parser.add_argument("--decision-threshold", type=float, default=0.5)
    parser.add_argument("--output", type=Path, default=DEFAULT_MODEL_PATH)
    arguments = parser.parse_args()

    captures = list(arguments.capture or [])
    if not captures:
        default_capture_dir = Path(__file__).resolve().parents[1] / "data" / "raw"
        captures = sorted(default_capture_dir.glob("*.csv"))

    if captures:
        features, labels, split, description = load_from_captures(
            captures, arguments.decimate_minutes
        )
        train_x, test_x = features[:split], features[split:]
        train_y, test_y = labels[:split], labels[split:]
        print(f"split         : {description}")
    else:
        print(
            "captures      : none found; using the physics generator.\n"
            "WARNING       : labels are then a restatement of the water-balance\n"
            "                formula, so the forest can only rediscover it."
        )
        features, labels = generate_dataset(arguments.samples, arguments.seed)
        train_x, test_x, train_y, test_y = train_test_split(
            features,
            labels,
            test_size=0.25,
            random_state=arguments.seed,
            stratify=labels,
        )
        print("split         : random 75/25")

    if arguments.backend == "sklearn":
        if arguments.device != "cpu":
            raise SystemExit(
                "the sklearn backend is CPU-only; use --backend xgboost for CUDA"
            )
        forest, score, importances = train_sklearn(train_x, train_y, arguments)
        artifact = export_sklearn(forest, arguments.decision_threshold)
    else:
        forest, score, importances, base_score = train_xgboost(
            train_x, train_y, arguments
        )
        artifact = export_xgboost(
            forest, base_score, arguments.decision_threshold
        )

    probabilities = score(test_x)
    predictions = (probabilities >= arguments.decision_threshold).astype(np.int64)
    matrix = confusion_matrix(test_y, predictions)

    print(f"backend       : {arguments.backend} on {arguments.device}")
    print(f"positives     : {labels.mean():.1%} of {len(labels)} samples")
    print(f"accuracy      : {accuracy_score(test_y, predictions):.4f}")
    print(f"roc auc       : {roc_auc_score(test_y, probabilities):.4f}")
    print(f"confusion     : {matrix.tolist()}  [[TN, FP], [FN, TP]]")
    print("importances   :")
    for name, importance in sorted(
        zip(FEATURE_NAMES, importances), key=lambda pair: pair[1], reverse=True
    ):
        print(f"  {name:<32} {importance:.4f}")

    audit = test_x[:2000].astype(np.float32).astype(np.float64)
    # scikit-learn averages float64 leaf probabilities, so the runtime should
    # reproduce it to the last bit. XGBoost accumulates margins in float32, so a
    # few units in the last place are expected there and are not a logic error.
    tolerance = 1e-9 if arguments.backend == "sklearn" else 1e-6
    verify_no_skew(artifact, audit, score(audit), tolerance)

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(artifact, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    size_kb = arguments.output.stat().st_size / 1024
    print(f"\nwrote {arguments.output} ({size_kb:.1f} KiB, {arguments.trees} trees)")


if __name__ == "__main__":
    main()
