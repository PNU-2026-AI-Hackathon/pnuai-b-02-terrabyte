"""Shared irrigation-volume model code.

``features`` and ``water_balance`` are imported by both the training tools and
the FastAPI app; that shared import is what prevents train/serve skew.
"""

from .features import (
    FEATURE_NAMES,
    INPUT_SCHEMA_VERSION,
    FeatureError,
    FeatureVector,
)

__all__ = [
    "FEATURE_NAMES",
    "INPUT_SCHEMA_VERSION",
    "FeatureError",
    "FeatureVector",
]
