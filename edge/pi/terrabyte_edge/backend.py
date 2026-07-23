"""Authenticated HTTP transport for the backend observation contract."""

from __future__ import annotations

from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from enum import Enum
import json
import time
from typing import Callable, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .protocol import Event


class Response(Protocol):
    status: int
    headers: object

    def read(self, amount: int = ...) -> bytes: ...

    def __enter__(self) -> "Response": ...

    def __exit__(self, *args: object) -> None: ...


class Delivery(str, Enum):
    DELIVERED = "delivered"
    RETRY = "retry"
    DEAD = "dead"


@dataclass(frozen=True)
class DeliveryResult:
    outcome: Delivery
    reason: str
    retry_after_seconds: float | None = None


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


class BackendClient:
    def __init__(
        self,
        *,
        url_for_context: Callable[[str], str],
        device_id: str,
        token: str,
        timeout_seconds: float,
        transport: Transport = _default_transport,
    ) -> None:
        self.url_for_context = url_for_context
        self.device_id = device_id
        self._token = token
        self.timeout_seconds = timeout_seconds
        self._transport = transport

    def send(self, event: Event) -> DeliveryResult:
        body = json.dumps(event.backend_body(), separators=(",", ":")).encode("utf-8")
        request = Request(
            self.url_for_context(event.context_id),
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Device-ID": self.device_id,
                "X-Arduino-Node-ID": event.node_id,
                "Idempotency-Key": event.event_id,
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

        if status == 201:
            return DeliveryResult(Delivery.DELIVERED, "created")
        if status in {401, 403, 404, 408, 425, 429} or status >= 500:
            return DeliveryResult(Delivery.RETRY, f"http_{status}")
        return DeliveryResult(Delivery.DEAD, f"unexpected_http_{status}")
