"""Run a soil-only random dosing campaign over a direct USB serial link.

This is bench tooling, not part of the deployed edge service. It talks directly
to the Arduino, appends every board line to JSONL, and never uses the backend,
MQTT, an Orange Pi, or an irrigation model. The operator uses a measuring cup
to log reservoir volumes, saucer runoff, and optional open-water evaporation.
The manual TSV kinds are ``reservoir_before``, ``reservoir_after``, ``runoff``,
and ``evap_reference``. A dry saucer needs an explicit 0 mL runoff row because
an absent row means unknown. For ``evap_reference``, log loss since the prior
cadence point and put ``surface_area_cm2=<number>`` in the note.

    python tools/dose_campaign.py --port COM5 --substrate-volume-ml 3000 \
        --substrate-description "potting soil" --soil-moisture-dry-adc 800 \
        --soil-moisture-wet-adc 350 --probe-depth-mm 55
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import random
import sys
import time
from typing import Any, Protocol, TextIO
import uuid


# These values mirror the firmware interlocks. The authoritative definitions
# live in edge/arduino/include/TelemetryConfig.h on feature/arduino-actuators.
TB_PUMP_ABS_MAX_MS = 210_000
TB_PUMP_MIN_INTERVAL_MS = 600_000
TB_HOST_TIMEOUT_MS = 3_000

KEEPALIVE_INTERVAL_SECONDS = 1.0
DEFAULT_TERMINAL_MARGIN_SECONDS = 5.0
DEFAULT_POLL_INTERVAL_SECONDS = 0.05
DEFAULT_REJECTION_BACKOFF_SECONDS = 1.0
DEFAULT_VOLUMES_ML = (10, 20, 30, 50, 80)

# The repository-wide 8.0 mL/s value is an uncalibrated assumption. This rig
# measured about 0.98 mL/s by pumping 500 mL in 8 minutes 30 seconds.
DEFAULT_FLOW_ML_PER_S = 0.98

MANUAL_LOG_HEADER = "timestamp_utc\tkind\tvalue_ml\tnote\n"
MANUAL_LOG_KINDS = frozenset(
    {"reservoir_before", "reservoir_after", "runoff", "evap_reference"}
)
REJECTION_REASONS = {"bad_request", "duplicate", "busy", "cooldown"}
TERMINAL_STOPS = {"volume_reached", "max_runtime", "watchdog"}


class Transport(Protocol):
    """The small pyserial surface used by the campaign state machine."""

    def readline(self) -> bytes: ...

    def write(self, data: bytes) -> int: ...

    def flush(self) -> None: ...

    def close(self) -> None: ...


class DoseSafetyError(ValueError):
    """Raised before an unsafe pump command can be emitted."""


class CampaignProtocolError(RuntimeError):
    """Raised when the board sends an impossible acknowledgement."""


def utc_stamp(now: datetime | None = None) -> str:
    """Return a JSON-friendly UTC timestamp."""

    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def volume_to_runtime_ms(volume_ml: int, flow_ml_per_s: float) -> int:
    """Convert a requested volume to pump runtime and enforce firmware G1."""

    if volume_ml <= 0:
        raise ValueError("volume_ml must be positive")
    if flow_ml_per_s <= 0:
        raise ValueError("flow_ml_per_s must be positive")

    runtime_ms = round(volume_ml * 1_000 / flow_ml_per_s)
    if runtime_ms > TB_PUMP_ABS_MAX_MS:
        raise DoseSafetyError(
            f"{volume_ml} mL needs {runtime_ms} ms at {flow_ml_per_s} mL/s; "
            f"firmware G1 allows at most {TB_PUMP_ABS_MAX_MS} ms"
        )
    return runtime_ms


class JsonlJournal:
    """Append board input and host-side campaign events to one durable stream."""

    def __init__(
        self,
        sink: TextIO,
        *,
        utc_now: Callable[[], datetime] | None = None,
        mirror: Callable[[str], None] | None = None,
    ) -> None:
        self._sink = sink
        self._utc_now = utc_now or (lambda: datetime.now(timezone.utc))
        self._mirror = mirror

    def _append(self, record: dict[str, Any]) -> None:
        self._sink.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
        self._sink.write("\n")
        # A multi-day capture must retain its latest line even if the laptop
        # sleeps, loses power, or has its USB cable disturbed immediately after.
        self._sink.flush()

    def append_received(self, raw: bytes) -> dict[str, Any] | None:
        """Persist one received serial line and return an object payload, if any."""

        text = raw.decode("utf-8", errors="replace").rstrip("\r\n")
        record: dict[str, Any] = {"captured_at_utc": utc_stamp(self._utc_now())}
        try:
            payload = json.loads(text)
        except (json.JSONDecodeError, UnicodeDecodeError):
            record["raw"] = text
            parsed = None
        else:
            record["payload"] = payload
            parsed = payload if isinstance(payload, dict) else None

        self._append(record)
        if self._mirror is not None:
            self._mirror(text)
        return parsed

    def append_event(self, event: str, **fields: Any) -> None:
        """Persist a host event beside, but distinct from, received payloads."""

        self._append(
            {
                "captured_at_utc": utc_stamp(self._utc_now()),
                "event": event,
                **fields,
            }
        )


@dataclass(frozen=True)
class DoseResult:
    command_id: str
    volume_ml: int
    requested_ms: int
    phase: str
    actual_ms: int | None = None
    reason: str | None = None
    stop: str | None = None


@dataclass
class CampaignSummary:
    commands_sent: int = 0
    accepted: int = 0
    completed: int = 0
    aborted: int = 0
    rejected: int = 0
    timed_out: int = 0
    cumulative_pump_runtime_ms: int = 0

    @property
    def terminal_doses(self) -> int:
        return self.completed + self.aborted

    def as_dict(self) -> dict[str, int]:
        return {
            "commands_sent": self.commands_sent,
            "accepted": self.accepted,
            "completed": self.completed,
            "aborted": self.aborted,
            "rejected": self.rejected,
            "timed_out": self.timed_out,
            "terminal_doses": self.terminal_doses,
            "cumulative_pump_runtime_ms": self.cumulative_pump_runtime_ms,
            "firmware_min_interval_ms": TB_PUMP_MIN_INTERVAL_MS,
        }


class DoseCampaign:
    """Drive one open serial transport through a sequence of random doses."""

    def __init__(
        self,
        transport: Transport,
        journal: JsonlJournal,
        *,
        volumes_ml: Sequence[int] = DEFAULT_VOLUMES_ML,
        flow_ml_per_s: float = DEFAULT_FLOW_ML_PER_S,
        settling_seconds: float = 0.0,
        rng: random.Random | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
        terminal_margin_seconds: float = DEFAULT_TERMINAL_MARGIN_SECONDS,
        rejection_backoff_seconds: float = DEFAULT_REJECTION_BACKOFF_SECONDS,
        command_id_prefix: str | None = None,
        on_firmware_version: Callable[[str], None] | None = None,
    ) -> None:
        if not volumes_ml:
            raise ValueError("volumes_ml must not be empty")
        if settling_seconds < 0:
            raise ValueError("settling_seconds must not be negative")
        if poll_interval_seconds <= 0:
            raise ValueError("poll_interval_seconds must be positive")
        if terminal_margin_seconds < 0:
            raise ValueError("terminal_margin_seconds must not be negative")
        if rejection_backoff_seconds < 0:
            raise ValueError("rejection_backoff_seconds must not be negative")

        checked_volumes = tuple(int(volume) for volume in volumes_ml)
        for volume in checked_volumes:
            volume_to_runtime_ms(volume, flow_ml_per_s)

        prefix = command_id_prefix or f"dc-{uuid.uuid4().hex[:8]}"
        if not prefix.isascii() or not prefix or len(prefix) > 13:
            raise ValueError("command_id_prefix must be 1-13 ASCII characters")

        self.transport = transport
        self.journal = journal
        self.volumes_ml = checked_volumes
        self.flow_ml_per_s = flow_ml_per_s
        self.settling_seconds = settling_seconds
        self.rng = rng or random.Random()
        self.clock = clock
        self.sleep = sleep
        self.poll_interval_seconds = poll_interval_seconds
        self.terminal_margin_seconds = terminal_margin_seconds
        self.rejection_backoff_seconds = rejection_backoff_seconds
        self.command_id_prefix = prefix
        self.on_firmware_version = on_firmware_version

        self.summary = CampaignSummary()
        self.firmware_version: str | None = None
        self._next_command_number = 0
        self._last_sequence: int | None = None
        self._last_uptime_ms: int | None = None
        self._pump_lockout_ms: int | None = None
        self._lockout_zero_seen_at: float | None = None
        self._reset_blocked_until = 0.0
        self._rejection_backoff_until = 0.0

    def draw_volume_ml(self) -> int:
        """Draw one label independently from the model and water-balance formula."""

        # Using the amount our own equation predicts and then training on it
        # would make the label a restatement of that equation. Section 4.2 of
        # docs/design/ml_irrigation_contract.md identifies that exact circularity.
        return self.rng.choice(self.volumes_ml)

    def next_command_id(self) -> str:
        """Return a session-unique ID within the firmware's 26-character limit."""

        self._next_command_number += 1
        command_id = f"{self.command_id_prefix}-{self._next_command_number:012x}"
        if len(command_id) > 26:  # Guard future prefix-format edits as well.
            raise RuntimeError("generated command id exceeds 26 characters")
        return command_id

    def _send_object(self, payload: dict[str, Any]) -> None:
        frame = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
        encoded = (frame + "\n").encode("ascii")
        written = self.transport.write(encoded)
        if written != len(encoded):
            raise OSError(f"short serial write: {written} of {len(encoded)} bytes")
        self.transport.flush()

    def _mark_reset(self, sequence: int | None, uptime_ms: int | None) -> None:
        previous_sequence = self._last_sequence
        previous_uptime_ms = self._last_uptime_ms
        self._reset_blocked_until = max(
            self._reset_blocked_until,
            self.clock() + TB_PUMP_MIN_INTERVAL_MS / 1_000,
        )
        self.journal.append_event(
            "session_boundary",
            reason="board_reset",
            previous_sequence=previous_sequence,
            sequence=sequence,
            previous_uptime_ms=previous_uptime_ms,
            uptime_ms=uptime_ms,
            host_safety_hold_ms=TB_PUMP_MIN_INTERVAL_MS,
        )

    def _observe_board_payload(self, payload: dict[str, Any]) -> None:
        message_type = payload.get("message_type")
        if message_type == "hello":
            firmware_version = payload.get("firmware_version")
            if isinstance(firmware_version, str):
                self.firmware_version = firmware_version
                if self.on_firmware_version is not None:
                    self.on_firmware_version(firmware_version)

        if message_type not in {"telemetry", "sensor_status"}:
            return

        sequence_value = payload.get("sequence")
        uptime_value = payload.get("uptime_ms")
        sequence = (
            sequence_value
            if isinstance(sequence_value, int) and not isinstance(sequence_value, bool)
            else None
        )
        uptime_ms = (
            uptime_value
            if isinstance(uptime_value, int) and not isinstance(uptime_value, bool)
            else None
        )

        sequence_went_back = (
            sequence is not None
            and self._last_sequence is not None
            and sequence < self._last_sequence
        )
        uptime_went_back = (
            uptime_ms is not None
            and self._last_uptime_ms is not None
            and uptime_ms < self._last_uptime_ms
        )
        if sequence_went_back or uptime_went_back:
            # Resetting the board clears its G2 history, so the host starts a
            # fresh full-duration hold from the moment it detects the reset.
            self._mark_reset(sequence, uptime_ms)

        if sequence is not None:
            self._last_sequence = sequence
        if uptime_ms is not None:
            self._last_uptime_ms = uptime_ms

        lockout_value = payload.get("pump_lockout_ms")
        if (
            isinstance(lockout_value, int)
            and not isinstance(lockout_value, bool)
            and lockout_value >= 0
        ):
            self._pump_lockout_ms = lockout_value
            if lockout_value == 0:
                if self._lockout_zero_seen_at is None:
                    self._lockout_zero_seen_at = self.clock()
            else:
                self._lockout_zero_seen_at = None

    def read_once(self) -> dict[str, Any] | None:
        """Read, durably record, and observe at most one board line."""

        raw = self.transport.readline()
        if not raw:
            return None
        payload = self.journal.append_received(raw)
        if payload is not None:
            self._observe_board_payload(payload)
        return payload

    def dose_is_allowed(self, *, require_firmware: bool = True) -> bool:
        """Return whether fresh board state and host safety holds allow a dose."""

        now = self.clock()
        if require_firmware and self.firmware_version is None:
            return False
        if now < self._reset_blocked_until or now < self._rejection_backoff_until:
            return False
        if self._pump_lockout_ms != 0 or self._lockout_zero_seen_at is None:
            return False
        return now >= self._lockout_zero_seen_at + self.settling_seconds

    def wait_until_dose_allowed(self, *, require_firmware: bool = True) -> None:
        """Poll telemetry until board lockout plus operator settling has elapsed."""

        poll_started_at = self.clock()
        poll_number = 1
        while not self.dose_is_allowed(require_firmware=require_firmware):
            payload = self.read_once()
            if payload is None:
                # This is only a short cooperative poll delay. The G2 decision
                # comes from fresh pump_lockout_ms telemetry, never a 10-minute
                # hard-coded sleep that could drift away from board state.
                now = self.clock()
                while (
                    poll_started_at + poll_number * self.poll_interval_seconds
                    <= now
                ):
                    poll_number += 1
                delay = (
                    poll_started_at + poll_number * self.poll_interval_seconds - now
                )
                if (
                    self._pump_lockout_ms == 0
                    and self._lockout_zero_seen_at is not None
                ):
                    allowed_at = max(
                        self._lockout_zero_seen_at + self.settling_seconds,
                        self._reset_blocked_until,
                        self._rejection_backoff_until,
                    )
                    remaining = allowed_at - now
                    if remaining > 0:
                        # Once telemetry establishes the exact allowed time,
                        # do not let a fixed poll step overshoot it.
                        delay = remaining
                self.sleep(delay)

    def _invalidate_lockout_observation(self) -> None:
        # A pre-command zero belongs to the previous state. Requiring a fresh
        # telemetry sample prevents a stale zero from bypassing G2 after a run.
        self._pump_lockout_ms = None
        self._lockout_zero_seen_at = None

    def _ack_for(self, payload: dict[str, Any] | None, command_id: str) -> dict[str, Any] | None:
        if payload is None or payload.get("t") != "ack":
            return None
        if payload.get("id") != command_id:
            return None
        phase = payload.get("ph")
        if phase not in {"accepted", "rejected", "completed", "aborted"}:
            raise CampaignProtocolError(f"unknown ack phase for {command_id}: {phase!r}")
        return payload

    def _terminal_result(
        self,
        command_id: str,
        volume_ml: int,
        requested_ms: int,
        ack: dict[str, Any],
    ) -> DoseResult:
        phase = str(ack["ph"])
        actual_value = ack.get("ms")
        actual_ms = (
            actual_value
            if isinstance(actual_value, int)
            and not isinstance(actual_value, bool)
            and actual_value >= 0
            else None
        )
        stop_value = ack.get("stop")
        stop = stop_value if isinstance(stop_value, str) else None
        if stop not in TERMINAL_STOPS:
            raise CampaignProtocolError(
                f"terminal ack for {command_id} has invalid stop: {stop!r}"
            )
        if actual_ms is None:
            raise CampaignProtocolError(
                f"terminal ack for {command_id} has invalid ms: {actual_value!r}"
            )

        self.summary.cumulative_pump_runtime_ms += actual_ms
        if phase == "completed":
            self.summary.completed += 1
        else:
            self.summary.aborted += 1
        result = DoseResult(
            command_id=command_id,
            volume_ml=volume_ml,
            requested_ms=requested_ms,
            phase=phase,
            actual_ms=actual_ms,
            stop=stop,
        )
        self.journal.append_event(
            "dose_outcome",
            command_id=command_id,
            phase=phase,
            requested_ml=volume_ml,
            requested_ms=requested_ms,
            actual_ms=actual_ms,
            stop=stop,
            cumulative_pump_runtime_ms=self.summary.cumulative_pump_runtime_ms,
        )
        return result

    def run_dose(self, volume_ml: int) -> DoseResult:
        """Send one command and wait for rejection, terminal ack, or deadline."""

        requested_ms = volume_to_runtime_ms(volume_ml, self.flow_ml_per_s)
        command_id = self.next_command_id()
        command = {
            "t": "cmd",
            "id": command_id,
            "act": "pump",
            "ms": requested_ms,
            "ml": volume_ml,
        }
        self._invalidate_lockout_observation()
        self._send_object(command)
        self.summary.commands_sent += 1
        self.journal.append_event("command_sent", command=command)

        ack_deadline = (
            self.clock() + requested_ms / 1_000 + self.terminal_margin_seconds
        )
        accepted = False
        run_ends_at: float | None = None
        next_keepalive_at: float | None = None

        while True:
            now = self.clock()
            if now > ack_deadline:
                break

            if (
                accepted
                and run_ends_at is not None
                and next_keepalive_at is not None
                and now >= next_keepalive_at
                and now < run_ends_at
            ):
                self._send_object({"t": "ka"})
                # Keep the cadence anchored to acceptance instead of letting
                # late wake-ups move every later keep-alive. Skip missed slots
                # so a delayed loop never emits a catch-up burst.
                next_keepalive_at += KEEPALIVE_INTERVAL_SECONDS
                if next_keepalive_at <= now:
                    missed_slots = (
                        int(
                            (now - next_keepalive_at)
                            / KEEPALIVE_INTERVAL_SECONDS
                        )
                        + 1
                    )
                    next_keepalive_at += (
                        missed_slots * KEEPALIVE_INTERVAL_SECONDS
                    )

            ack = self._ack_for(self.read_once(), command_id)
            if ack is not None:
                phase = ack["ph"]
                if phase == "accepted":
                    if not accepted:
                        accepted = True
                        self.summary.accepted += 1
                        accepted_at = self.clock()
                        run_ends_at = accepted_at + requested_ms / 1_000
                        next_keepalive_at = (
                            accepted_at + KEEPALIVE_INTERVAL_SECONDS
                        )
                        # The pump needs keep-alives only until the run ends;
                        # the later deadline is solely for collecting its ack.
                        ack_deadline = max(
                            ack_deadline,
                            run_ends_at + self.terminal_margin_seconds,
                        )
                elif phase == "rejected":
                    reason = ack.get("r")
                    if reason not in REJECTION_REASONS:
                        raise CampaignProtocolError(
                            f"rejected ack for {command_id} has invalid reason: {reason!r}"
                        )
                    self.summary.rejected += 1
                    self._rejection_backoff_until = max(
                        self._rejection_backoff_until,
                        self.clock() + self.rejection_backoff_seconds,
                    )
                    result = DoseResult(
                        command_id=command_id,
                        volume_ml=volume_ml,
                        requested_ms=requested_ms,
                        phase="rejected",
                        reason=str(reason),
                    )
                    self.journal.append_event(
                        "dose_outcome",
                        command_id=command_id,
                        phase="rejected",
                        reason=reason,
                        requested_ml=volume_ml,
                        requested_ms=requested_ms,
                        backoff_seconds=self.rejection_backoff_seconds,
                    )
                    return result
                else:
                    return self._terminal_result(
                        command_id, volume_ml, requested_ms, ack
                    )

            now = self.clock()
            if now >= ack_deadline:
                break
            wake_at = min(now + self.poll_interval_seconds, ack_deadline)
            if (
                next_keepalive_at is not None
                and run_ends_at is not None
                and next_keepalive_at < run_ends_at
            ):
                # Wake on the absolute keep-alive slot when it is closer than
                # the next ordinary read poll, avoiding a whole-poll overshoot.
                wake_at = min(wake_at, next_keepalive_at)
            self.sleep(wake_at - now)

        self.summary.timed_out += 1
        self.journal.append_event(
            "dose_outcome",
            command_id=command_id,
            phase="timeout",
            requested_ml=volume_ml,
            requested_ms=requested_ms,
            margin_seconds=self.terminal_margin_seconds,
        )
        return DoseResult(
            command_id=command_id,
            volume_ml=volume_ml,
            requested_ms=requested_ms,
            phase="timeout",
        )

    def run(self, dose_count: int | None = None) -> CampaignSummary:
        """Run until the requested number of terminal doses, or forever."""

        if dose_count is not None and dose_count <= 0:
            raise ValueError("dose_count must be positive or None")
        while dose_count is None or self.summary.terminal_doses < dose_count:
            self.wait_until_dose_allowed()
            self.run_dose(self.draw_volume_ml())
        return self.summary

    def record_summary(self) -> None:
        """Append the cumulative runtime needed for later duty-cycle checks."""

        self.journal.append_event("campaign_summary", **self.summary.as_dict())


def open_serial_port(port: str, baud: int, timeout_seconds: float = 0.1) -> Transport:
    """Open a real serial port without making pyserial an import dependency."""

    try:
        import serial  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - operator-facing dependency
        raise RuntimeError("pyserial is required: pip install pyserial") from exc
    return serial.Serial(port=port, baudrate=baud, timeout=timeout_seconds)


def ensure_manual_log(path: Path) -> None:
    """Create the stable measuring-cup log without truncating existing data."""

    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="") as sink:
            sink.write(MANUAL_LOG_HEADER)
            sink.flush()
    except FileExistsError:
        pass


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    """Write the operator metadata needed by later fitting."""

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as sink:
        json.dump(manifest, sink, ensure_ascii=False, indent=2, sort_keys=True)
        sink.write("\n")
        sink.flush()


def default_output_paths(now: datetime | None = None) -> tuple[Path, Path, Path]:
    """Return the three daily paths under edge/pi/data/raw."""

    date = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime(
        "%Y%m%d"
    )
    raw_dir = Path(__file__).resolve().parents[1] / "data" / "raw"
    stem = raw_dir / f"campaign-{date}"
    return stem.with_suffix(".jsonl"), stem.with_suffix(".json"), Path(
        f"{stem}-manual.tsv"
    )


def build_parser() -> argparse.ArgumentParser:
    output, manifest, manual_log = default_output_paths()
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--port", required=True, help="e.g. COM5 or /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument(
        "--dose-count",
        type=int,
        help="number of completed/aborted doses; omit to run until Ctrl-C",
    )
    parser.add_argument("--volumes-ml", type=int, nargs="+", default=list(DEFAULT_VOLUMES_ML))
    parser.add_argument("--seed", type=int, help="seed for a reproducible volume schedule")
    parser.add_argument("--flow-ml-per-s", type=float, default=DEFAULT_FLOW_ML_PER_S)
    parser.add_argument("--settling-seconds", type=float, default=0.0)
    parser.add_argument("--terminal-margin-seconds", type=float, default=DEFAULT_TERMINAL_MARGIN_SECONDS)
    parser.add_argument("--output", type=Path, default=output, help="append-only board JSONL")
    parser.add_argument("--manifest", type=Path, default=manifest)
    parser.add_argument("--manual-log", type=Path, default=manual_log)

    parser.add_argument("--substrate-volume-ml", type=int, required=True)
    parser.add_argument("--substrate-description", required=True)
    parser.add_argument("--soil-moisture-dry-adc", type=int, required=True)
    parser.add_argument("--soil-moisture-wet-adc", type=int, required=True)
    parser.add_argument("--probe-depth-mm", type=float, required=True)
    return parser


def _validated_arguments(parser: argparse.ArgumentParser, argv: Sequence[str] | None) -> argparse.Namespace:
    arguments = parser.parse_args(argv)
    if arguments.dose_count is not None and arguments.dose_count <= 0:
        parser.error("--dose-count must be positive")
    if arguments.substrate_volume_ml <= 0:
        parser.error("--substrate-volume-ml must be positive")
    if arguments.probe_depth_mm <= 0:
        parser.error("--probe-depth-mm must be positive")
    if arguments.settling_seconds < 0:
        parser.error("--settling-seconds must not be negative")
    if arguments.terminal_margin_seconds < 0:
        parser.error("--terminal-margin-seconds must not be negative")
    try:
        for volume_ml in arguments.volumes_ml:
            volume_to_runtime_ms(volume_ml, arguments.flow_ml_per_s)
    except ValueError as exc:
        parser.error(str(exc))
    return arguments


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    arguments = _validated_arguments(parser, argv)

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    ensure_manual_log(arguments.manual_log)
    manifest_data: dict[str, Any] = {
        "substrate_volume_ml": arguments.substrate_volume_ml,
        "substrate_description": arguments.substrate_description,
        "crop_code": "unknown",
        "soil_moisture_dry_adc": arguments.soil_moisture_dry_adc,
        "soil_moisture_wet_adc": arguments.soil_moisture_wet_adc,
        "flow_ml_per_s": arguments.flow_ml_per_s,
        "firmware_version": None,
        "probe_insertion_depth_mm": arguments.probe_depth_mm,
    }
    write_manifest(arguments.manifest, manifest_data)

    transport: Transport | None = None
    campaign: DoseCampaign | None = None
    try:
        with arguments.output.open("a", encoding="utf-8", newline="") as sink:
            journal = JsonlJournal(sink, mirror=lambda line: print(line, file=sys.stderr))

            # Open exactly once and retain this handle for the whole campaign.
            # Reopening asserts DTR and resets the board, which clears G2 and
            # restarts sequence/uptime, destroying both safety and continuity.
            transport = open_serial_port(arguments.port, arguments.baud)

            def record_firmware_version(version: str) -> None:
                manifest_data["firmware_version"] = version
                write_manifest(arguments.manifest, manifest_data)

            campaign = DoseCampaign(
                transport,
                journal,
                volumes_ml=arguments.volumes_ml,
                flow_ml_per_s=arguments.flow_ml_per_s,
                settling_seconds=arguments.settling_seconds,
                rng=random.Random(arguments.seed),
                terminal_margin_seconds=arguments.terminal_margin_seconds,
                on_firmware_version=record_firmware_version,
            )
            try:
                campaign.run(arguments.dose_count)
            except KeyboardInterrupt:
                print("\ncampaign stopped by operator", file=sys.stderr)
            finally:
                campaign.record_summary()
    except RuntimeError as exc:
        parser.error(str(exc))
    finally:
        if transport is not None:
            transport.close()

    if campaign is not None:
        print(
            "cumulative pump runtime: "
            f"{campaign.summary.cumulative_pump_runtime_ms} ms; "
            f"firmware G2 minimum interval: {TB_PUMP_MIN_INTERVAL_MS} ms",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
