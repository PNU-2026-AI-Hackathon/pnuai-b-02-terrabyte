from io import BytesIO
import json
import unittest
from urllib.error import HTTPError, URLError

from terrabyte_edge.backend import HttpPublisher
from terrabyte_edge.protocol import Event
from terrabyte_edge.publisher import Delivery


def event() -> Event:
    return Event(
        event_id="event-123",
        context_id="ctx/id",
        captured_at_utc="2026-07-21T04:05:06Z",
        node_id="node-1",
        sequence=1,
        uptime_ms=100,
        air_temperature_c=20.0,
        relative_humidity_pct=50.0,
        ppfd_umol_m2_s=300.0,
    )


class FakeResponse:
    def __init__(self, status: int) -> None:
        self.status = status
        self.headers: dict[str, str] = {}

    def read(self, amount: int = -1) -> bytes:
        return b"{}"

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None


class BackendTests(unittest.TestCase):
    def client(self, transport):
        return HttpPublisher(
            telemetry_url=lambda: "https://api.example.test/api/telemetry",
            device_id="gateway-1",
            token="super-secret",
            timeout_seconds=4.0,
            transport=transport,
        )

    def test_created_request_matches_contract_and_authenticates_device(self) -> None:
        captured = {}

        def transport(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return FakeResponse(202)

        result = self.client(transport).send(event())

        self.assertIs(result.outcome, Delivery.DELIVERED)
        request = captured["request"]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Authorization"), "Bearer super-secret")
        self.assertEqual(captured["timeout"], 4.0)
        self.assertEqual(
            request.full_url,
            "https://api.example.test/api/telemetry",
        )
        # Identity and idempotency now travel in the envelope, so the v1
        # X-Device-ID / X-Arduino-Node-ID / Idempotency-Key headers are gone.
        for header in ("X-device-id", "X-arduino-node-id", "Idempotency-key"):
            self.assertIsNone(request.get_header(header))
        self.assertEqual(
            json.loads(request.data),
            {
                "schema_version": 2,
                "event_type": "telemetry.sample",
                "gateway_id": "gateway-1",
                "event_id": "event-123",
                "observed_at": "2026-07-21T04:05:06Z",
                "nodes": [
                    {
                        "node_id": "node-1",
                        "sequence": 1,
                        "measurements": {
                            "air_temperature_c": 20.0,
                            "air_humidity_pct": 50.0,
                            "plant_light_ppfd_umol_m2_s": 300.0,
                        },
                        "quality": {
                            "air_sensor_valid": True,
                            "light_sensor_valid": True,
                            "soil_sensor_valid": False,
                        },
                    }
                ],
            },
        )

    def test_duplicate_observation_is_delivered(self) -> None:
        error = HTTPError(
            "https://api.example.test",
            409,
            "Conflict",
            {},
            BytesIO(b'{"code":"DUPLICATE_OBSERVATION"}'),
        )

        def transport(_request, _timeout):
            raise error

        result = self.client(transport).send(event())
        self.assertIs(result.outcome, Delivery.DELIVERED)

    def test_retryable_status_honors_retry_after(self) -> None:
        error = HTTPError(
            "https://api.example.test",
            429,
            "Too Many Requests",
            {"Retry-After": "17"},
            BytesIO(b"{}"),
        )

        def transport(_request, _timeout):
            raise error

        result = self.client(transport).send(event())
        self.assertIs(result.outcome, Delivery.RETRY)
        self.assertEqual(result.retry_after_seconds, 17.0)

    def test_network_and_server_errors_retry_but_bad_request_is_dead(self) -> None:
        cases = [
            (URLError("offline"), Delivery.RETRY),
            (
                HTTPError("https://x", 503, "Down", {}, BytesIO(b"{}")),
                Delivery.RETRY,
            ),
            (
                HTTPError(
                    "https://x",
                    400,
                    "Bad",
                    {},
                    BytesIO(b'{"code":"INVALID_CANONICAL_VALUE"}'),
                ),
                Delivery.DEAD,
            ),
            (
                HTTPError("https://x", 401, "Unauthorized", {}, BytesIO(b"{}")),
                Delivery.RETRY,
            ),
            (
                HTTPError("https://x", 404, "Not found", {}, BytesIO(b"{}")),
                Delivery.RETRY,
            ),
        ]
        for error, expected in cases:
            with self.subTest(error=error):
                def transport(_request, _timeout, raised=error):
                    raise raised

                self.assertIs(self.client(transport).send(event()).outcome, expected)

    def test_close_is_a_no_op(self) -> None:
        self.client(lambda request, timeout: FakeResponse(201)).close()


if __name__ == "__main__":
    unittest.main()
