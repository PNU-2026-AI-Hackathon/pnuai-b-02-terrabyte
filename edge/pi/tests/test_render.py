import unittest
from terrabyte_edge.ui.render import STALE_AFTER_SECONDS, build_view

NOW = 1_700_000_000.0


def snapshot(**overrides):
    value = {
        "schema": 1, "generated_at_epoch": NOW, "started_at_epoch": NOW - 3600,
        "gateway_id": "gw-1", "claim_code": "", "transport": {"connected": True, "last_delivery_epoch": NOW - 2},
        "outbox": {"pending": 0, "dead": 0},
        "ports": [{"node_id": "node-1", "link": "up", "last_frame_epoch": NOW - 3,
                   "measurements": {"air_temperature_c": 27.14, "air_humidity_pct": 58,
                                    "plant_light_ppfd_umol_m2_s": 2.69, "soil_temperature_c": None}}],
        "events": [],
    }
    value.update(overrides); return value


class RenderTests(unittest.TestCase):
    def test_metrics_precision_and_missing_probe(self):
        row = build_view(snapshot(), now_epoch=NOW).rows[0]
        self.assertEqual(row.values, ("27.1℃", "58%", "2.7", "—", "—"))

    def test_single_port_is_followed_by_empty_slots(self):
        view = build_view(snapshot(), now_epoch=NOW)
        self.assertEqual(len(view.rows), 4)
        self.assertEqual(view.rows[1].link_text, "포트 없음")

    def test_missing_and_stale_snapshots_degrade_visibly(self):
        self.assertIsNotNone(build_view(None, now_epoch=NOW).banner)
        stale = snapshot(generated_at_epoch=NOW - STALE_AFTER_SECONDS - 1)
        self.assertEqual(build_view(stale, now_epoch=NOW).banner.level, "error")

    def test_fresh_snapshot_has_no_banner(self):
        self.assertIsNone(build_view(snapshot(), now_epoch=NOW).banner)


if __name__ == "__main__": unittest.main()
