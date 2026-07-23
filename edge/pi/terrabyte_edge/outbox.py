"""Durable SQLite outbox for store-and-forward delivery."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
import time
from typing import Callable, Iterator

from .protocol import Event


@dataclass(frozen=True)
class OutboxItem:
    event: Event
    attempts: int


class OutboxFullError(RuntimeError):
    """Raised before enqueueing when the configured row limit is reached."""


class Outbox:
    def __init__(
        self,
        path: Path,
        *,
        retry_base_seconds: float,
        retry_max_seconds: float,
        max_rows: int = 100_000,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.path = path
        self.retry_base_seconds = retry_base_seconds
        self.retry_max_seconds = retry_max_seconds
        self.max_rows = max_rows
        self.clock = clock

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=30.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 30000")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("PRAGMA synchronous = FULL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS telemetry_outbox (
                    event_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at_epoch REAL NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                    next_attempt_epoch REAL NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'dead')),
                    last_error TEXT
                );
                CREATE INDEX IF NOT EXISTS telemetry_outbox_pending
                    ON telemetry_outbox(status, next_attempt_epoch, created_at_epoch);
                CREATE INDEX IF NOT EXISTS telemetry_outbox_order
                    ON telemetry_outbox(status, created_at_epoch, event_id);
                """
            )

    def enqueue(self, event: Event) -> bool:
        payload = json.dumps(
            event.to_record(), separators=(",", ":"), ensure_ascii=True
        )
        now = self.clock()
        with self._connect() as connection:
            row_count = connection.execute(
                "SELECT COUNT(*) FROM telemetry_outbox"
            ).fetchone()[0]
            if row_count >= self.max_rows:
                raise OutboxFullError(
                    f"outbox row limit reached ({self.max_rows})"
                )
            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO telemetry_outbox(
                    event_id, payload_json, created_at_epoch, next_attempt_epoch
                ) VALUES (?, ?, ?, ?)
                """,
                (event.event_id, payload, now, now),
            )
        return cursor.rowcount == 1

    def due(self, limit: int) -> list[OutboxItem]:
        now = self.clock()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json, attempts, next_attempt_epoch
                FROM telemetry_outbox
                WHERE status = 'pending'
                ORDER BY created_at_epoch, event_id
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        # A delayed oldest item blocks newer items. Otherwise a network retry
        # would silently reorder observations on the backend.
        due_rows = []
        for row in rows:
            if row["next_attempt_epoch"] > now:
                break
            due_rows.append(row)
        return [
            OutboxItem(Event.from_record(json.loads(row["payload_json"])), row["attempts"])
            for row in due_rows
        ]

    def mark_delivered(self, event_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM telemetry_outbox WHERE event_id = ?", (event_id,)
            )

    def mark_retry(
        self, event_id: str, attempts: int, error: str, retry_after: float | None
    ) -> float:
        exponential = self.retry_base_seconds * (2 ** min(attempts, 20))
        delay = min(self.retry_max_seconds, exponential)
        if retry_after is not None:
            # Retry-After is a server-mandated lower bound, even when it is
            # longer than the locally configured exponential-backoff cap.
            delay = max(delay, retry_after)
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE telemetry_outbox
                SET attempts = attempts + 1,
                    next_attempt_epoch = ?,
                    last_error = ?
                WHERE event_id = ? AND status = 'pending'
                """,
                (self.clock() + delay, error[:256], event_id),
            )
        return delay

    def mark_dead(self, event_id: str, error: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE telemetry_outbox
                SET status = 'dead', attempts = attempts + 1, last_error = ?
                WHERE event_id = ?
                """,
                (error[:256], event_id),
            )

    def counts(self) -> tuple[int, int]:
        with self._connect() as connection:
            rows = dict(
                connection.execute(
                    "SELECT status, COUNT(*) FROM telemetry_outbox GROUP BY status"
                ).fetchall()
            )
        return rows.get("pending", 0), rows.get("dead", 0)
