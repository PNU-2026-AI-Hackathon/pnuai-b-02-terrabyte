from __future__ import annotations

from datetime import datetime, timezone
import heapq
import io
import json
from pathlib import Path
import random
import sys
import tempfile
import unittest


TOOLS_DIR = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS_DIR))

import dose_campaign as campaign  # noqa: E402


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self._observers = []

    def monotonic(self) -> float:
        return self.now

    def add_observer(self, observer) -> None:
        self._observers.append(observer)

    def sleep(self, seconds: float) -> None:
        if seconds < 0:
            raise AssertionError("the driver tried to sleep backwards")
        target = self.now + seconds
        for observer in self._observers:
            observer(target)
        self.now = target


class FlushCountingStringIO(io.StringIO):
    def __init__(self) -> None:
        super().__init__()
        self.flush_count = 0

    def flush(self) -> None:
        self.flush_count += 1
        super().flush()


class StrictFakeTransport:
    """A tiny firmware model that fails fast on unsafe host behaviour."""

    def __init__(self, clock: FakeClock, *, omit_terminal_ml: bool = False) -> None:
        self.clock = clock
        self.clock.add_observer(self._before_time_advance)
        self.omit_terminal_ml = omit_terminal_ml
        self.closed = False
        self.flush_count = 0
        self.frames = []
        self.command_ids = set()
        self.command_frames = []
        self.keepalive_times = []
        self.forced_rejections = []
        self._events = []
        self._event_number = 0
        self._running = False
        self._running_command = None
        self._last_host_activity = None
        self._completion_at = None
        self._lockout_until = 0.0

    def queue_payload(self, payload: dict, *, delay: float = 0.0) -> None:
        self.queue_line(
            json.dumps(payload, separators=(",", ":")).encode("ascii") + b"\n",
            delay=delay,
        )

    def queue_line(self, raw: bytes, *, delay: float = 0.0) -> None:
        self._event_number += 1
        heapq.heappush(
            self._events,
            (self.clock.now + delay, self._event_number, raw),
        )

    def reject_next(self, reason: str) -> None:
        if reason not in campaign.REJECTION_REASONS:
            raise ValueError(reason)
        self.forced_rejections.append(reason)

    def _before_time_advance(self, target: float) -> None:
        if not self._running:
            return
        assert self._last_host_activity is not None
        assert self._completion_at is not None
        running_until = min(target, self._completion_at)
        silence = running_until - self._last_host_activity
        if silence >= campaign.TB_HOST_TIMEOUT_MS / 1_000:
            raise AssertionError(
                f"missing keep-alive: host silence reached {silence:.3f} seconds"
            )

    def _decode_frame(self, data: bytes) -> dict:
        if not data.endswith(b"\n") or data.count(b"\n") != 1:
            raise AssertionError(f"malformed line framing: {data!r}")
        try:
            text = data.decode("ascii")
            payload = json.loads(text)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AssertionError(f"malformed outbound frame: {data!r}") from exc
        if not isinstance(payload, dict):
            raise AssertionError("outbound JSON must be an object")
        return payload

    def write(self, data: bytes) -> int:
        payload = self._decode_frame(data)
        self.frames.append(payload)
        if payload == {"t": "ka"}:
            if not self._running:
                raise AssertionError("keep-alive sent while no dose is running")
            assert self._completion_at is not None
            if self.clock.now > self._completion_at:
                raise AssertionError("keep-alive sent after the run deadline")
            self.keepalive_times.append(self.clock.now)
            self._last_host_activity = self.clock.now
            return len(data)

        if set(payload) != {"t", "id", "act", "ms", "ml"}:
            raise AssertionError(f"malformed command keys: {set(payload)}")
        if payload["t"] != "cmd" or payload["act"] != "pump":
            raise AssertionError(f"malformed command: {payload}")
        command_id = payload["id"]
        if not isinstance(command_id, str) or not command_id or len(command_id) > 26:
            raise AssertionError(f"invalid command id: {command_id!r}")
        if command_id in self.command_ids:
            raise AssertionError(f"duplicate command id: {command_id}")
        self.command_ids.add(command_id)
        if (
            not isinstance(payload["ms"], int)
            or isinstance(payload["ms"], bool)
            or payload["ms"] <= 0
            or payload["ms"] > campaign.TB_PUMP_ABS_MAX_MS
        ):
            raise AssertionError(f"unsafe runtime: {payload['ms']!r}")
        if not isinstance(payload["ml"], int) or payload["ml"] <= 0:
            raise AssertionError(f"invalid volume label: {payload['ml']!r}")
        self.command_frames.append(payload)

        if self.forced_rejections:
            reason = self.forced_rejections.pop(0)
            self.queue_payload(
                {"t": "ack", "id": command_id, "ph": "rejected", "r": reason}
            )
            return len(data)
        if self._running:
            self.queue_payload(
                {"t": "ack", "id": command_id, "ph": "rejected", "r": "busy"}
            )
            return len(data)
        if self.clock.now < self._lockout_until:
            self.queue_payload(
                {
                    "t": "ack",
                    "id": command_id,
                    "ph": "rejected",
                    "r": "cooldown",
                }
            )
            return len(data)

        self._running = True
        self._running_command = payload
        self._last_host_activity = self.clock.now
        self._completion_at = self.clock.now + payload["ms"] / 1_000
        self.queue_payload({"t": "ack", "id": command_id, "ph": "accepted"})
        terminal = {
            "t": "ack",
            "id": command_id,
            "ph": "completed",
            "ms": payload["ms"],
            "stop": "volume_reached",
        }
        if not self.omit_terminal_ml:
            terminal["ml"] = payload["ml"]
        self.queue_payload(terminal, delay=payload["ms"] / 1_000)
        return len(data)

    def readline(self) -> bytes:
        self._before_time_advance(self.clock.now)
        if not self._events or self._events[0][0] > self.clock.now:
            return b""
        _, _, raw = heapq.heappop(self._events)
        payload = None
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
        if (
            isinstance(payload, dict)
            and payload.get("t") == "ack"
            and payload.get("ph") in {"completed", "aborted"}
            and self._running_command is not None
            and payload.get("id") == self._running_command["id"]
        ):
            self._running = False
            self._lockout_until = self.clock.now + campaign.TB_PUMP_MIN_INTERVAL_MS / 1_000
            self._running_command = None
            self._last_host_activity = None
            self._completion_at = None
        return raw

    def flush(self) -> None:
        self.flush_count += 1

    def close(self) -> None:
        self.closed = True


def make_driver(
    *,
    volumes=(10, 20, 30, 50, 80),
    flow=campaign.DEFAULT_FLOW_ML_PER_S,
    settling=0.0,
    seed=1,
    omit_terminal_ml=False,
    terminal_margin=0.2,
    rejection_backoff=0.1,
):
    clock = FakeClock()
    transport = StrictFakeTransport(clock, omit_terminal_ml=omit_terminal_ml)
    sink = FlushCountingStringIO()
    journal = campaign.JsonlJournal(
        sink,
        utc_now=lambda: datetime(2026, 8, 25, tzinfo=timezone.utc),
    )
    driver = campaign.DoseCampaign(
        transport,
        journal,
        volumes_ml=volumes,
        flow_ml_per_s=flow,
        settling_seconds=settling,
        rng=random.Random(seed),
        clock=clock.monotonic,
        sleep=clock.sleep,
        poll_interval_seconds=0.05,
        terminal_margin_seconds=terminal_margin,
        rejection_backoff_seconds=rejection_backoff,
        command_id_prefix="test",
    )
    return driver, transport, clock, sink


class DoseCampaignTests(unittest.TestCase):
    def test_volume_conversion_and_g1_refusal_before_write(self) -> None:
        self.assertEqual(campaign.volume_to_runtime_ms(10, 0.98), 10_204)
        self.assertEqual(campaign.volume_to_runtime_ms(205, 0.98), 209_184)
        with self.assertRaises(campaign.DoseSafetyError):
            campaign.volume_to_runtime_ms(206, 0.98)

        driver, transport, _, _ = make_driver(volumes=(10,))
        with self.assertRaises(campaign.DoseSafetyError):
            driver.run_dose(206)
        self.assertEqual(transport.frames, [])

    def test_ids_remain_unique_and_within_limit_across_many_doses(self) -> None:
        driver, transport, clock, _ = make_driver(volumes=(1,), flow=1_000)
        for _ in range(40):
            result = driver.run_dose(1)
            self.assertEqual(result.phase, "completed")
            clock.sleep(campaign.TB_PUMP_MIN_INTERVAL_MS / 1_000)

        ids = [frame["id"] for frame in transport.command_frames]
        self.assertEqual(len(ids), 40)
        self.assertEqual(len(set(ids)), 40)
        self.assertTrue(all(len(command_id) <= 26 for command_id in ids))

    def test_keepalive_is_sent_at_one_hz_for_the_whole_run(self) -> None:
        driver, transport, _, _ = make_driver(volumes=(5,), flow=1.0)
        result = driver.run_dose(5)

        self.assertEqual(result.phase, "completed")
        self.assertGreaterEqual(len(transport.keepalive_times), 4)
        gaps = [
            later - earlier
            for earlier, later in zip(
                transport.keepalive_times, transport.keepalive_times[1:]
            )
        ]
        self.assertTrue(all(abs(gap - 1.0) < 1e-9 for gap in gaps))
        self.assertLessEqual(transport.keepalive_times[0], 1.0)

    def test_accepted_then_completed_and_missing_legacy_ml_is_tolerated(self) -> None:
        driver, _, _, sink = make_driver(
            volumes=(2,), flow=1.0, omit_terminal_ml=True
        )
        result = driver.run_dose(2)

        self.assertEqual(result.phase, "completed")
        self.assertEqual(result.actual_ms, 2_000)
        self.assertEqual(driver.summary.accepted, 1)
        self.assertEqual(driver.summary.completed, 1)
        self.assertEqual(driver.summary.cumulative_pump_runtime_ms, 2_000)
        ack_phases = [
            record["payload"]["ph"]
            for record in map(json.loads, sink.getvalue().splitlines())
            if record.get("payload", {}).get("t") == "ack"
        ]
        self.assertEqual(ack_phases, ["accepted", "completed"])

    def test_cooldown_rejection_backs_off_and_waits_for_lockout_telemetry(self) -> None:
        driver, transport, clock, _ = make_driver(
            volumes=(1,), flow=1_000, settling=0.25
        )
        transport.reject_next("cooldown")
        result = driver.run_dose(1)
        self.assertEqual(result.phase, "rejected")
        self.assertEqual(result.reason, "cooldown")

        transport.queue_payload(
            {
                "message_type": "telemetry",
                "sequence": 1,
                "uptime_ms": 1_000,
                "pump_lockout_ms": 500,
            }
        )
        transport.queue_payload(
            {
                "message_type": "telemetry",
                "sequence": 2,
                "uptime_ms": 1_500,
                "pump_lockout_ms": 0,
            },
            delay=0.5,
        )
        driver.wait_until_dose_allowed(require_firmware=False)

        self.assertAlmostEqual(clock.now, 0.75, places=7)
        self.assertEqual(len(transport.command_frames), 1)
        second = driver.run_dose(1)
        self.assertEqual(second.phase, "completed")

    def test_board_reset_marks_boundary_and_applies_full_host_g2_hold(self) -> None:
        driver, transport, clock, sink = make_driver(volumes=(1,), flow=1_000)
        transport.queue_payload(
            {
                "message_type": "telemetry",
                "sequence": 12,
                "uptime_ms": 20_000,
                "pump_lockout_ms": 300_000,
            }
        )
        transport.queue_payload(
            {
                "message_type": "telemetry",
                "sequence": 0,
                "uptime_ms": 100,
                "pump_lockout_ms": 0,
            }
        )
        driver.read_once()
        driver.read_once()

        self.assertFalse(driver.dose_is_allowed(require_firmware=False))
        clock.sleep(campaign.TB_PUMP_MIN_INTERVAL_MS / 1_000 - 0.001)
        self.assertFalse(driver.dose_is_allowed(require_firmware=False))
        self.assertEqual(transport.command_frames, [])
        clock.sleep(0.001)
        self.assertTrue(driver.dose_is_allowed(require_firmware=False))

        boundaries = [
            record
            for record in map(json.loads, sink.getvalue().splitlines())
            if record.get("event") == "session_boundary"
        ]
        self.assertEqual(len(boundaries), 1)
        self.assertEqual(boundaries[0]["reason"], "board_reset")
        self.assertEqual(
            boundaries[0]["host_safety_hold_ms"], campaign.TB_PUMP_MIN_INTERVAL_MS
        )

    def test_jsonl_keeps_every_line_stamp_and_unparsable_raw_text(self) -> None:
        driver, transport, _, sink = make_driver()
        transport.queue_payload(
            {"message_type": "hello", "firmware_version": "0.5.0"}
        )
        transport.queue_line(b"not-json\n")
        transport.queue_payload(
            {
                "message_type": "telemetry",
                "sequence": 0,
                "uptime_ms": 10,
                "pump_lockout_ms": 0,
            }
        )

        driver.read_once()
        driver.read_once()
        driver.read_once()
        records = list(map(json.loads, sink.getvalue().splitlines()))

        self.assertEqual(len(records), 3)
        self.assertTrue(all("captured_at_utc" in record for record in records))
        self.assertTrue(
            all(record["captured_at_utc"].endswith("Z") for record in records)
        )
        self.assertEqual(records[1]["raw"], "not-json")
        self.assertEqual(records[2]["payload"]["message_type"], "telemetry")
        self.assertEqual(sink.flush_count, 3)

    def test_random_schedule_uses_only_allowlist_and_repeats_with_seed(self) -> None:
        allowed = (7, 11, 19)
        first, _, _, _ = make_driver(volumes=allowed, flow=1_000, seed=42)
        second, _, _, _ = make_driver(volumes=allowed, flow=1_000, seed=42)

        first_schedule = [first.draw_volume_ml() for _ in range(100)]
        second_schedule = [second.draw_volume_ml() for _ in range(100)]
        self.assertEqual(first_schedule, second_schedule)
        self.assertTrue(set(first_schedule).issubset(allowed))
        self.assertGreater(len(set(first_schedule)), 1)

    def test_manifest_and_manual_volume_log_have_required_fields(self) -> None:
        manifest = {
            "substrate_volume_ml": 3_000,
            "substrate_description": "soil only",
            "crop_code": "unknown",
            "soil_moisture_dry_adc": 800,
            "soil_moisture_wet_adc": 350,
            "flow_ml_per_s": 0.98,
            "firmware_version": "0.5.0",
            "probe_insertion_depth_mm": 55.0,
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "campaign.json"
            manual_path = root / "campaign-manual.tsv"
            campaign.write_manifest(manifest_path, manifest)
            campaign.ensure_manual_log(manual_path)
            campaign.ensure_manual_log(manual_path)

            self.assertEqual(json.loads(manifest_path.read_text("utf-8")), manifest)
            self.assertEqual(
                manual_path.read_text("utf-8"), campaign.MANUAL_LOG_HEADER
            )
            self.assertEqual(
                campaign.MANUAL_LOG_KINDS,
                {
                    "reservoir_before",
                    "reservoir_after",
                    "runoff",
                    "evap_reference",
                },
            )


if __name__ == "__main__":
    unittest.main()
