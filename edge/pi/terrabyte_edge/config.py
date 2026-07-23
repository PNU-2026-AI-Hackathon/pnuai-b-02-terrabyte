"""Environment-backed service configuration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import re
from typing import Mapping
from urllib.parse import quote, urlparse


class ConfigError(ValueError):
    """Raised when required configuration is missing or invalid."""


NODE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise ConfigError(f"{name} must be set")
    return value


def _integer(
    env: Mapping[str, str], name: str, default: int, *, minimum: int = 1
) -> int:
    raw = env.get(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer") from exc
    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}")
    return value


def _number(
    env: Mapping[str, str], name: str, default: float, *, minimum: float = 0.0
) -> float:
    raw = env.get(name, str(default)).strip()
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number") from exc
    if value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}")
    return value


def _boolean(env: Mapping[str, str], name: str, default: bool = False) -> bool:
    raw = env.get(name, "true" if default else "false").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ConfigError(f"{name} must be true or false")


def _utc_timestamp(env: Mapping[str, str], name: str, default: str) -> datetime:
    raw = env.get(name, default).strip()
    if not raw.endswith("Z"):
        raise ConfigError(f"{name} must be an ISO-8601 UTC timestamp ending in Z")
    try:
        value = datetime.fromisoformat(raw[:-1] + "+00:00")
    except ValueError as exc:
        raise ConfigError(f"{name} must be an ISO-8601 UTC timestamp") from exc
    return value.astimezone(timezone.utc)


def _load_token(env: Mapping[str, str]) -> str:
    direct = env.get("TB_DEVICE_TOKEN", "").strip()
    token_file = env.get("TB_DEVICE_TOKEN_FILE", "").strip()
    if bool(direct) == bool(token_file):
        raise ConfigError(
            "set exactly one of TB_DEVICE_TOKEN or TB_DEVICE_TOKEN_FILE"
        )
    if direct:
        return direct
    try:
        token = Path(token_file).read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ConfigError("cannot read TB_DEVICE_TOKEN_FILE") from exc
    if not token:
        raise ConfigError("TB_DEVICE_TOKEN_FILE is empty")
    return token


@dataclass(frozen=True)
class Settings:
    serial_port: str
    serial_baud: int
    serial_timeout_seconds: float
    serial_reconnect_seconds: float
    serial_max_line_bytes: int
    database_path: Path
    backend_base_url: str
    crop_context_id: str
    device_id: str
    expected_node_id: str
    device_token: str
    clock_minimum_utc: datetime
    http_timeout_seconds: float
    upload_batch_size: int
    outbox_max_rows: int
    upload_interval_seconds: float
    retry_base_seconds: float
    retry_max_seconds: float
    log_level: str

    def observations_url(self, context_id: str) -> str:
        context = quote(context_id, safe="")
        return (
            f"{self.backend_base_url}/api/crop-contexts/{context}"
            "/environment-observations"
        )

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        values = os.environ if env is None else env
        base_url = _required(values, "TB_BACKEND_BASE_URL").rstrip("/")
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ConfigError("TB_BACKEND_BASE_URL must be an HTTP(S) URL")
        if parsed.scheme != "https" and not _boolean(
            values, "TB_ALLOW_INSECURE_HTTP"
        ):
            raise ConfigError(
                "HTTP backend requires TB_ALLOW_INSECURE_HTTP=true; use HTTPS in production"
            )

        log_level = values.get("TB_LOG_LEVEL", "INFO").strip().upper()
        if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ConfigError("TB_LOG_LEVEL is invalid")

        retry_base = _number(values, "TB_RETRY_BASE_SECONDS", 2.0, minimum=0.1)
        retry_max = _number(values, "TB_RETRY_MAX_SECONDS", 300.0, minimum=0.1)
        if retry_max < retry_base:
            raise ConfigError("TB_RETRY_MAX_SECONDS must not be below retry base")

        expected_node_id = _required(values, "TB_EXPECTED_NODE_ID")
        if NODE_ID.fullmatch(expected_node_id) is None:
            raise ConfigError("TB_EXPECTED_NODE_ID contains unsupported characters")

        return cls(
            serial_port=_required(values, "TB_SERIAL_PORT"),
            serial_baud=_integer(values, "TB_SERIAL_BAUD", 115200),
            serial_timeout_seconds=_number(
                values, "TB_SERIAL_TIMEOUT_SECONDS", 1.0, minimum=0.1
            ),
            serial_reconnect_seconds=_number(
                values, "TB_SERIAL_RECONNECT_SECONDS", 2.0, minimum=0.1
            ),
            serial_max_line_bytes=_integer(
                values, "TB_SERIAL_MAX_LINE_BYTES", 4096, minimum=128
            ),
            database_path=Path(
                values.get(
                    "TB_DATABASE_PATH", "/var/lib/terrabyte-edge/outbox.sqlite3"
                )
            ),
            backend_base_url=base_url,
            crop_context_id=_required(values, "TB_CROP_CONTEXT_ID"),
            device_id=_required(values, "TB_DEVICE_ID"),
            expected_node_id=expected_node_id,
            device_token=_load_token(values),
            clock_minimum_utc=_utc_timestamp(
                values, "TB_CLOCK_MINIMUM_UTC", "2025-01-01T00:00:00Z"
            ),
            http_timeout_seconds=_number(
                values, "TB_HTTP_TIMEOUT_SECONDS", 10.0, minimum=0.1
            ),
            upload_batch_size=_integer(values, "TB_UPLOAD_BATCH_SIZE", 20),
            outbox_max_rows=_integer(values, "TB_OUTBOX_MAX_ROWS", 100_000),
            upload_interval_seconds=_number(
                values, "TB_UPLOAD_INTERVAL_SECONDS", 2.0, minimum=0.1
            ),
            retry_base_seconds=retry_base,
            retry_max_seconds=retry_max,
            log_level=log_level,
        )
