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
from typing import Callable, Protocol, runtime_checkable

from .protocol import CommandAck, Event


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


# ``retained`` must survive the transport seam: retained commands are stale
# fossils that would otherwise execute again after every reconnect.
CommandHandler = Callable[[bytes, bool], None]


@runtime_checkable
class CommandTransport(Protocol):
    """MQTT's command downlink and ack uplink capabilities."""

    def subscribe_commands(self, handler: CommandHandler) -> None: ...

    def send_ack(self, ack: CommandAck) -> DeliveryResult: ...
