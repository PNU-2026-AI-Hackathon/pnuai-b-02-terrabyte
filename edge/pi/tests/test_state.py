import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from terrabyte_edge import state
from terrabyte_edge.state import GatewayState, read_snapshot, write_snapshot


class StateTests(unittest.TestCase):
    def test_frame_maps_current_event_fields(self) -> None:
        state = GatewayState(gateway_id="gw-1", port="/dev/ttyUSB0", clock=lambda: 100.0)
        state.record_frame(SimpleNamespace(
            node_id="node-1", air_temperature_c=22.5,
            relative_humidity_pct=51.0, ppfd_umol_m2_s=2.69,
            soil_temperature_c=None, soil_moisture_pct=34.0,
        ))
        port = state.snapshot()["ports"][0]
        self.assertEqual(port["node_id"], "node-1")
        self.assertEqual(port["measurements"]["plant_light_ppfd_umol_m2_s"], 2.69)
        self.assertNotIn("soil_temperature_c", port["measurements"])

    def test_atomic_file_is_world_readable_and_round_trips(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            payload = GatewayState(gateway_id="gw", port="tty", clock=lambda: 1.0).snapshot()
            write_snapshot(path, payload)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o644)
            self.assertEqual(read_snapshot(path), payload)
            self.assertEqual(json.loads(path.read_text())["schema"], 1)

    def test_bad_or_missing_snapshot_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            self.assertIsNone(read_snapshot(path))
            path.write_text('{"schema": 99}')
            self.assertIsNone(read_snapshot(path))


if __name__ == "__main__": unittest.main()


class DefaultSnapshotPathTests(unittest.TestCase):
    """The default has to survive being run somewhere that is not the Orange Pi."""

    def test_linux_keeps_the_run_tmpfs(self) -> None:
        with mock.patch.object(state.sys, "platform", "linux"), \
                mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                state._default_snapshot_path(),
                Path("/run/terrabyte-edge/status.json"),
            )

    def test_non_linux_falls_back_to_a_writable_temp_dir(self) -> None:
        # macOS has no /run and a read-only root, so the Linux path raises
        # OSError before the service finishes starting.
        with mock.patch.object(state.sys, "platform", "darwin"), \
                mock.patch.dict(os.environ, {}, clear=True):
            path = state._default_snapshot_path()
        self.assertFalse(str(path).startswith("/run"))
        self.assertEqual(path.name, "status.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        self.assertTrue(os.access(path.parent, os.W_OK))

    def test_env_override_wins_on_every_platform(self) -> None:
        for platform in ("linux", "darwin"):
            with mock.patch.object(state.sys, "platform", platform), \
                    mock.patch.dict(os.environ, {"TB_SNAPSHOT_PATH": "/tmp/custom.json"}):
                self.assertEqual(
                    state._default_snapshot_path(), Path("/tmp/custom.json")
                )
