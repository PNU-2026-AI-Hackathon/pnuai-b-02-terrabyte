"""Environment configuration.

Rolling a model back is an env var change plus a restart, never a code change.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MODEL_PATH = (
    Path(__file__).resolve().parents[1] / "models" / "irrigation_reg_v1.joblib"
)


@dataclass(frozen=True)
class Settings:
    model_path: Path
    api_key: str | None

    @classmethod
    def from_environment(cls) -> "Settings":
        raw_key = os.environ.get("AI_API_KEY", "").strip()
        return cls(
            model_path=Path(os.environ.get("AI_MODEL_PATH", str(DEFAULT_MODEL_PATH))),
            # Unset means no authentication: the server is only reachable inside
            # the compose network and its port is not published in production.
            # Setting the variable turns the check on.
            api_key=raw_key or None,
        )
