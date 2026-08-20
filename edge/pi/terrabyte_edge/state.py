"""Thread-safe bridge status and atomic JSON snapshot I/O."""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
from threading import Lock
import time

SNAPSHOT_SCHEMA = 1
DEFAULT_SNAPSHOT_PATH = Path("/run/terrabyte-edge/status.json")


class GatewayState:
    def __init__(self, *, gateway_id: str, port: str, clock=time.time) -> None:
        self._lock = Lock()
        self._clock = clock
        self._started = clock()
        self._gateway_id = gateway_id
        self._port = port
        self._last_frame: float | None = None
        self._node_id: str | None = None
        self._measurements: dict[str, float] = {}
        self._connected = False
        self._last_error: str | None = None
        self._last_delivery: float | None = None
        self._pending = 0
        self._dead = 0

    def record_frame(self, event: object) -> None:
        with self._lock:
            self._last_frame = self._clock()
            self._node_id = str(getattr(event, "node_id"))
            pairs = (
                ("air_temperature_c", "air_temperature_c"),
                ("air_humidity_pct", "relative_humidity_pct"),
                ("plant_light_ppfd_umol_m2_s", "ppfd_umol_m2_s"),
                ("soil_temperature_c", "soil_temperature_c"),
                ("soil_moisture_pct", "soil_moisture_pct"),
            )
            self._measurements = {
                output: float(value)
                for output, attribute in pairs
                if (value := getattr(event, attribute, None)) is not None
            }

    def record_transport(self, *, connected: bool, error: str | None = None) -> None:
        with self._lock:
            self._connected = connected
            self._last_error = error
            if connected:
                self._last_delivery = self._clock()

    def record_outbox(self, pending: int, dead: int) -> None:
        with self._lock:
            self._pending, self._dead = pending, dead

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {
                "schema": SNAPSHOT_SCHEMA,
                "generated_at_epoch": self._clock(),
                "started_at_epoch": self._started,
                "gateway_id": self._gateway_id,
                "claim_code": "",
                "transport": {
                    "connected": self._connected,
                    "last_error": self._last_error,
                    "last_delivery_epoch": self._last_delivery,
                },
                "outbox": {"pending": self._pending, "dead": self._dead},
                "ports": [{
                    "path": self._port,
                    "node_id": self._node_id,
                    "link": "up" if self._last_frame is not None else "never_seen",
                    "last_frame_epoch": self._last_frame,
                    "measurements": dict(self._measurements),
                }],
                "events": [],
            }


def write_snapshot(path: Path, snapshot: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent,
        prefix=path.name + ".", suffix=".tmp", delete=False,
    )
    try:
        with handle:
            json.dump(snapshot, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(handle.name, 0o644)
        os.replace(handle.name, path)
    except BaseException:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
        raise


def read_snapshot(path: Path) -> dict[str, object] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or payload.get("schema") != SNAPSHOT_SCHEMA:
        return None
    return payload
