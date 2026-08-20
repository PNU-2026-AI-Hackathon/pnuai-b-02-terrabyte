import json
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

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
