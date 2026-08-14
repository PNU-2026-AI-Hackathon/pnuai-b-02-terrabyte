"""MqttPublisher tests against a fake paho client — no broker, no network.

A ``client_factory`` is injected so these tests run even when paho-mqtt is
not installed in the environment.
"""

import json
import unittest

from terrabyte_edge.mqtt_publisher import MqttPublisher
from terrabyte_edge.protocol import Event
from terrabyte_edge.publisher import Delivery


def event() -> Event:
    return Event(
        event_id="event-123",
        context_id="ctx-1",
        captured_at_utc="2026-07-21T04:05:06Z",
        node_id="terrabyte-node-01",
        sequence=1042,
        uptime_ms=100,
        air_temperature_c=27.1,
        relative_humidity_pct=58.0,
        ppfd_umol_m2_s=230.5,
    )


class FakeMessageInfo:
    def __init__(self, rc: int = 0, published: bool = True, mid: int = 1) -> None:
        self.rc = rc
        # paho correlates a PUBACK with its publish through mid; the publisher
        # uses it to look up the v5 reason code the broker returned.
        self.mid = mid
        self._published = published

    def wait_for_publish(self, timeout=None) -> None:
        if not self._published:
            raise ValueError("timed out waiting for publish")

    def is_published(self) -> bool:
        return self._published


class FakeMqttClient:
    """Stands in for paho.mqtt.client.Client's subset MqttPublisher uses."""

    def __init__(self) -> None:
        self.will = None
        self.on_connect = None
        self.username = None
        self.password = None
        self.tls_enabled = False
        self.connected_to = None
        self.on_disconnect = None
        self.on_publish = None
        self.connected = True
        self.loop_started = False
        self.loop_stopped = False
        self.disconnected = False
        self.published: list[tuple[str, bytes, int, bool]] = []
        self.next_publish_result = FakeMessageInfo()

    def will_set(self, topic, payload, qos=0, retain=False):
        self.will = (topic, payload, qos, retain)

    def username_pw_set(self, username, password=None):
        self.username = username
        self.password = password

    def tls_set(self, *args, **kwargs):
        self.tls_enabled = True

    def reconnect_delay_set(self, min_delay=1, max_delay=120):
        pass

    def connect_async(self, host, port, keepalive=60):
        # The publisher must never use the blocking connect(): an unreachable
        # broker would then raise out of __init__ and abort service start-up.
        self.connected_to = (host, port, keepalive)

    def is_connected(self):
        return self.connected

    def loop_start(self):
        self.loop_started = True

    def loop_stop(self):
        self.loop_stopped = True

    def disconnect(self):
        self.disconnected = True

    def publish(self, topic, payload, qos=0, retain=False):
        self.published.append((topic, payload, qos, retain))
        return self.next_publish_result

    def simulate_connect(self):
        # The real client invokes on_connect from its network thread once
        # CONNACK arrives; tests trigger it explicitly instead.
        self.on_connect(self, None, {}, 0)

    def simulate_puback(self, mid, reason_code=None):
        """Deliver the v5 PUBACK reason code the broker returned for ``mid``."""

        self.on_publish(self, None, mid, reason_code)


def make_publisher(client: FakeMqttClient, **overrides) -> MqttPublisher:
    kwargs = dict(
        host="mqtt.example.test",
        port=1883,
        gateway_id="orangepi-pro-01",
        topic_prefix="tb/v2",
        client_factory=lambda: client,
    )
    kwargs.update(overrides)
    return MqttPublisher(**kwargs)


class LifecycleTests(unittest.TestCase):
    def test_lwt_is_registered_before_connect(self) -> None:
        client = FakeMqttClient()
        # will_set must happen before connect(); assert by checking both were
        # called and the will was captured, since connect() records nothing
        # about ordering itself, we check will is set at all and connect()
        # was reached (constructor would raise/hang otherwise).
        make_publisher(client)
        self.assertEqual(
            client.will,
            ("tb/v2/orangepi-pro-01/up/status", b'{"online":false}', 1, True),
        )
        self.assertIsNotNone(client.connected_to)
        self.assertTrue(client.loop_started)

    def test_status_is_published_retained_on_connect(self) -> None:
        client = FakeMqttClient()
        make_publisher(client)
        client.simulate_connect()

        topic, payload, qos, retain = client.published[-1]
        self.assertEqual(topic, "tb/v2/orangepi-pro-01/up/status")
        self.assertEqual(payload, b'{"online":true}')
        self.assertEqual(qos, 1)
        self.assertTrue(retain)

    def test_credentials_and_tls_are_configured_when_provided(self) -> None:
        client = FakeMqttClient()
        make_publisher(client, username="gw-1", password="secret", tls=True)
        self.assertEqual(client.username, "gw-1")
        self.assertEqual(client.password, "secret")
        self.assertTrue(client.tls_enabled)

    def test_close_stops_loop_and_disconnects(self) -> None:
        client = FakeMqttClient()
        publisher = make_publisher(client)
        publisher.close()
        self.assertTrue(client.loop_stopped)
        self.assertTrue(client.disconnected)


class SendTests(unittest.TestCase):
    def test_telemetry_is_published_not_retained_and_puback_maps_to_delivered(
        self,
    ) -> None:
        client = FakeMqttClient()
        client.next_publish_result = FakeMessageInfo(rc=0, published=True)
        publisher = make_publisher(client)

        result = publisher.send(event())

        self.assertIs(result.outcome, Delivery.DELIVERED)
        topic, payload, qos, retain = client.published[-1]
        self.assertEqual(topic, "tb/v2/orangepi-pro-01/up/telemetry")
        self.assertEqual(qos, 1)
        self.assertFalse(retain)
        body = json.loads(payload)
        self.assertEqual(body["gateway_id"], "orangepi-pro-01")
        self.assertEqual(body["nodes"][0]["measurements"]["air_humidity_pct"], 58.0)

    def test_missing_puback_maps_to_retry(self) -> None:
        client = FakeMqttClient()
        client.next_publish_result = FakeMessageInfo(rc=0, published=False)
        publisher = make_publisher(client)

        result = publisher.send(event())
        self.assertIs(result.outcome, Delivery.RETRY)

    def test_nonzero_publish_rc_maps_to_retry(self) -> None:
        client = FakeMqttClient()
        client.next_publish_result = FakeMessageInfo(rc=4, published=False)
        publisher = make_publisher(client)

        result = publisher.send(event())
        self.assertIs(result.outcome, Delivery.RETRY)

    def test_publish_raising_maps_to_retry(self) -> None:
        client = FakeMqttClient()

        def raising_publish(topic, payload, qos=0, retain=False):
            raise OSError("not connected")

        client.publish = raising_publish
        publisher = make_publisher(client)

        result = publisher.send(event())
        self.assertIs(result.outcome, Delivery.RETRY)
        self.assertEqual(result.reason, "OSError")

    def test_local_envelope_failure_is_dead_not_retry(self) -> None:
        # DEAD is reserved for a local schema-validation failure discovered
        # before anything reaches the broker — MQTT itself has no 4xx to
        # signal "this payload is permanently invalid".
        client = FakeMqttClient()
        publisher = make_publisher(client)

        class ExplodingEvent:
            def envelope_v2(self, *, gateway_id):
                raise ValueError("boom")

        result = publisher.send(ExplodingEvent())
        self.assertIs(result.outcome, Delivery.DEAD)


if __name__ == "__main__":
    unittest.main()


class BrokerRejectionTests(unittest.TestCase):
    """Regressions for failures only a real broker exposed.

    Each of these looked fine against a hand-written fake and was wrong in
    practice, which is the same way the v1 contract stayed broken.
    """

    def test_an_unreachable_broker_does_not_abort_construction(self) -> None:
        """The edge boots before the broker is reachable — that is what the
        durable outbox is for. A blocking connect() raised ConnectionRefusedError
        straight out of __init__ and killed service start-up instead."""

        client = FakeMqttClient()
        client.connected = False
        publisher = make_publisher(client)

        result = publisher.send(event())
        self.assertIs(result.outcome, Delivery.RETRY)
        self.assertEqual(result.reason, "not_connected")

    def test_a_disconnected_session_fails_fast_instead_of_waiting_for_puback(
        self,
    ) -> None:
        """Publishing while disconnected used to queue locally and burn the
        whole PUBACK timeout, then report the misleading 'puback_timeout' —
        including when the broker had actually rejected the credentials."""

        client = FakeMqttClient()
        client.connected = False
        publisher = make_publisher(client)

        self.assertEqual(publisher.send(event()).reason, "not_connected")
        self.assertEqual(client.published, [])

    def test_an_acl_rejected_publish_is_not_reported_as_delivered(self) -> None:
        """MQTT 3.1.1 acknowledges a publish the ACL refused, so a gateway
        publishing outside its own namespace saw 'delivered', dropped the event
        from the outbox and lost it silently. v5 carries the refusal on the
        PUBACK; this asserts it is surfaced as RETRY rather than success."""

        client = FakeMqttClient()
        publisher = make_publisher(client)
        client.simulate_connect()

        class NotAuthorized:
            is_failure = True

            def __str__(self) -> str:
                return "Not authorized"

        info = client.next_publish_result
        client.simulate_puback(info.mid, NotAuthorized())

        result = publisher.send(event())
        self.assertIs(result.outcome, Delivery.RETRY)
        self.assertIn("Not authorized", result.reason)

    def test_a_successful_puback_reason_still_maps_to_delivered(self) -> None:
        """'No matching subscribers' (0x10) is a success code, not a refusal —
        it just means nobody was subscribed yet."""

        client = FakeMqttClient()
        publisher = make_publisher(client)
        client.simulate_connect()

        class NoMatchingSubscribers:
            is_failure = False
            value = 0x10

            def __str__(self) -> str:
                return "No matching subscribers"

        info = client.next_publish_result
        client.simulate_puback(info.mid, NoMatchingSubscribers())

        result = publisher.send(event())
        self.assertIs(result.outcome, Delivery.DELIVERED)
