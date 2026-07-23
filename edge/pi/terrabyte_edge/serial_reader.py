"""Reconnect-capable USB serial JSON Lines reader."""

from __future__ import annotations

import logging
from threading import Event
from typing import Callable, Iterator, Protocol


LOGGER = logging.getLogger(__name__)


class SerialHandle(Protocol):
    def readline(self, size: int = ...) -> bytes: ...

    def close(self) -> None: ...


SerialFactory = Callable[..., SerialHandle]


def _default_serial_factory(**kwargs: object) -> SerialHandle:
    try:
        import serial
    except ImportError as exc:
        raise RuntimeError("pyserial is required to read the Arduino") from exc
    return serial.Serial(**kwargs)


class SerialLineReader:
    def __init__(
        self,
        *,
        port: str,
        baudrate: int,
        timeout_seconds: float,
        reconnect_seconds: float,
        max_line_bytes: int,
        factory: SerialFactory = _default_serial_factory,
    ) -> None:
        self.port = port
        self.baudrate = baudrate
        self.timeout_seconds = timeout_seconds
        self.reconnect_seconds = reconnect_seconds
        self.max_line_bytes = max_line_bytes
        self.factory = factory

    def lines(self, stop: Event) -> Iterator[bytes]:
        while not stop.is_set():
            handle: SerialHandle | None = None
            try:
                handle = self.factory(
                    port=self.port,
                    baudrate=self.baudrate,
                    timeout=self.timeout_seconds,
                )
                LOGGER.info("serial connected port=%s", self.port)
                while not stop.is_set():
                    line = handle.readline(self.max_line_bytes + 1)
                    if not line:
                        continue
                    if len(line) > self.max_line_bytes:
                        LOGGER.warning("discarding oversized serial message")
                        if not line.endswith(b"\n"):
                            self._discard_remainder(handle, stop)
                        continue
                    if not line.endswith(b"\n"):
                        LOGGER.warning("discarding incomplete serial message")
                        self._discard_remainder(handle, stop)
                        continue
                    yield line
            except Exception as exc:  # the service must recover from USB driver errors
                LOGGER.warning("serial unavailable error=%s", type(exc).__name__)
            finally:
                if handle is not None:
                    try:
                        handle.close()
                    except Exception:
                        LOGGER.debug("serial close failed", exc_info=True)
            if not stop.is_set():
                LOGGER.info("serial reconnect scheduled")
                stop.wait(self.reconnect_seconds)

    def _discard_remainder(self, handle: SerialHandle, stop: Event) -> None:
        while not stop.is_set():
            chunk = handle.readline(self.max_line_bytes + 1)
            if not chunk or chunk.endswith(b"\n"):
                return
