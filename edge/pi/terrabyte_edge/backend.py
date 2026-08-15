"""Authenticated HTTP transport for the backend telemetry contract (envelope v2).

This is the HTTP fallback/debug publisher (design doc §6.6, §8.1) — the
operational path is ``MqttPublisher`` in ``mqtt_publisher.py``. Both share
the ``Publisher`` protocol from ``publisher.py``.
"""

from __future__ import annotations

from email.utils import parsedate_to_datetime
import json
import time
from typing import Callable, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .protocol import Event
from .publisher import Delivery, DeliveryResult

# Re-exported so existing callers that imported these from ``backend``
# (they used to be defined here) keep working without a code change.
__all__ = ["Delivery", "DeliveryResult", "HttpPublisher", "Response", "Transport"]


class Response(Protocol):
    status: int
    headers: object

    def read(self, amount: int = ...) -> bytes: ...

    def __enter__(self) -> "Response": ...

    def __exit__(self, *args: object) -> None: ...


Transport = Callable[[Request, float], Response]


def _default_transport(request: Request, timeout: float) -> Response:
    return urlopen(request, timeout=timeout)  # nosec B310: URL is configured by operator


def _error_code(body: bytes) -> str | None:
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict):
        return None
    direct = parsed.get("code")
    if isinstance(direct, str):
        return direct
    error = parsed.get("error")
    if isinstance(error, dict) and isinstance(error.get("code"), str):
        return error["code"]
    return None


def _retry_after(headers: object) -> float | None:
    get = getattr(headers, "get", None)
    raw = get("Retry-After") if callable(get) else None
    if not raw:
        return None
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        try:
            target = parsedate_to_datetime(str(raw)).timestamp()
        except (TypeError, ValueError, OverflowError):
            return None
        return max(0.0, target - time.time())


class HttpPublisher:
    """Formerly ``BackendClient``. Renamed per design doc §8.1: MQTT is now
    the primary transport and this is kept as the HTTP fallback/debug path.
    """

    def __init__(
        self,
        *,
        telemetry_url: Callable[[], str],
        device_id: str,
        token: str,
        timeout_seconds: float,
        transport: Transport = _default_transport,
    ) -> None:
        self.telemetry_url = telemetry_url
        self.device_id = device_id
        self._token = token
        self.timeout_seconds = timeout_seconds
        self._transport = transport

    def send(self, event: Event) -> DeliveryResult:
        body = json.dumps(
            event.envelope_v2(gateway_id=self.device_id), separators=(",", ":")
        ).encode("utf-8")
        request = Request(
            self.telemetry_url(),
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                # The envelope carries gateway_id, node_id and event_id, so
                # none of them are duplicated into headers any more; the
                # backend reads identity and idempotency from the body alone.
                "User-Agent": "terrabyte-edge/0.1",
            },
        )
        try:
            with self._transport(request, self.timeout_seconds) as response:
                status = response.status
                response.read(65536)
        except HTTPError as exc:
            status = exc.code
            try:
                body = exc.read(65536)
            finally:
                exc.close()
            code = _error_code(body)
            if status == 409 and code == "DUPLICATE_OBSERVATION":
                return DeliveryResult(Delivery.DELIVERED, code)
            # Authentication, gateway provisioning, and crop-context assignment
            # may be repaired while the bridge is running. Keep those events in
            # the durable queue instead of turning a temporary setup issue into
            # permanent data loss.
            if status in {401, 403, 404, 408, 425, 429} or status >= 500:
                return DeliveryResult(
                    Delivery.RETRY,
                    f"http_{status}",
                    _retry_after(exc.headers),
                )
            return DeliveryResult(
                Delivery.DEAD, code or f"http_{status}"
            )
        except (URLError, OSError, TimeoutError) as exc:
            return DeliveryResult(Delivery.RETRY, type(exc).__name__)

        if status == 202:
            return DeliveryResult(Delivery.DELIVERED, "accepted")
        if status in {401, 403, 404, 408, 425, 429} or status >= 500:
            return DeliveryResult(Delivery.RETRY, f"http_{status}")
        return DeliveryResult(Delivery.DEAD, f"unexpected_http_{status}")

    def close(self) -> None:
        # urlopen() does not hold a persistent connection between calls, so
        # there is nothing to release here. Present for Publisher protocol
        # symmetry with MqttPublisher, whose close() does matter.
        return None
