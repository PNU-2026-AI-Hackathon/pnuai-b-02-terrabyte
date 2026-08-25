#!/usr/bin/env python3
"""Write a synthetic dataset to CSV for inspection.

    python tools/generate_dataset.py --samples 5000 --seed 42 --output /tmp/ds.csv

Training does not need this -- ``train_irrigation_regressor.py`` generates the
data in memory. This exists so the labels can be eyeballed or plotted.

Do not commit the output (D25). Only the generator and its seed belong in the
repository; the dataset is reproduced from them.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from terrabyte_ai.dataset import COLUMNS, generate  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()

    data = generate(arguments.samples, arguments.seed)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    with arguments.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(COLUMNS)
        writer.writerows(data.to_rows())

    print(f"{len(data)}행 저장: {arguments.output}")
    print(f"세션 수: {len(set(data.session_ids.tolist()))}")
    print(f"라벨 mL  평균 {data.volume_ml.mean():.1f}  최대 {data.volume_ml.max():.1f}")


if __name__ == "__main__":
    main()
