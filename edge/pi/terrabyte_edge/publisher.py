"""Transport-agnostic delivery contract between the outbox and a publisher.

``service.py`` only ever calls ``publisher.send(event) -> DeliveryResult`` and
``publisher.close()``. Keeping that seam in its own module means the HTTP and
MQTT implementations (``backend.py`` / ``mqtt_publisher.py``) can be swapped
without either one importing the other, and without ``service.py`` knowing
which transport it is driving.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from .protocol import Event


class Delivery(str, Enum):
    DELIVERED = "delivered"
    RETRY = "retry"
    DEAD = "dead"


@dataclass(frozen=True)
class DeliveryResult:
    outcome: Delivery
    reason: str
    retry_after_seconds: float | None = None


class Publisher(Protocol):
    def send(self, event: Event) -> DeliveryResult: ...

    def close(self) -> None: ...
