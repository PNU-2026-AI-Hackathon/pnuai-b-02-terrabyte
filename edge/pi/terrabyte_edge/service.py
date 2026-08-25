"""Long-running serial ingestion, command relay, and durable upload service."""

from __future__ import annotations

from dataclasses import replace
import json
import logging
from pathlib import Path
from threading import Event, Thread
from typing import Callable, Sequence

from .backend import HttpPublisher
from .command_relay import CommandJournal, CommandRelay
from .config import Settings
from .irrigation.volume import MODEL_VERSION, suggest_volume_ml
from .mqtt_publisher import MqttPublisher
from .outbox import KIND_ACK, KIND_TELEMETRY, Outbox, OutboxFullError
from .protocol import (
    Event as TelemetryEvent,
    IrrigationSuggestion,
    NonTelemetryMessage,
    ProtocolError,
    parse_line,
)
from .publisher import CommandTransport, Delivery, DeliveryResult, Publisher
from .serial_reader import SerialLineReader
from .state import DEFAULT_SNAPSHOT_PATH, GatewayState, write_snapshot


LOGGER = logging.getLogger(__name__)


def _build_publisher(settings: Settings) -> Publisher:
    if settings.transport == "mqtt":
        return MqttPublisher(
            host=settings.mqtt_host,
            port=settings.mqtt_port,
            gateway_id=settings.device_id,
            topic_prefix=settings.mqtt_topic_prefix,
            username=settings.mqtt_username,
            password=settings.mqtt_password,
            tls=settings.mqtt_tls,
            tls_ca_cert=settings.mqtt_tls_ca_cert,
            keepalive_seconds=settings.mqtt_keepalive_seconds,
            publish_timeout_seconds=settings.mqtt_publish_timeout_seconds,
        )
    return HttpPublisher(
        telemetry_url=settings.telemetry_url,
        device_id=settings.device_id,
        token=settings.device_token,
        timeout_seconds=settings.http_timeout_seconds,
    )


class BridgeService:
    def __init__(
        self,
        settings: Settings,
        *,
        outbox: Outbox | None = None,
        publisher: Publisher | None = None,
        serial_reader: SerialLineReader | None = None,
        serial_readers: Sequence[SerialLineReader] | None = None,
        state: GatewayState | None = None,
        snapshot_path: Path | None = None,
        command_relay: CommandRelay | None = None,
    ) -> None:
        if serial_reader is not None and serial_readers is not None:
            raise ValueError("pass serial_reader or serial_readers, not both")

        self.settings = settings
        self.stop_event = Event()
        self.outbox = outbox or Outbox(
            settings.database_path,
            retry_base_seconds=settings.retry_base_seconds,
            retry_max_seconds=settings.retry_max_seconds,
            max_rows=settings.outbox_max_rows,
        )
        self.publisher = publisher or _build_publisher(settings)

        if serial_readers is not None:
            readers = list(serial_readers)
        elif serial_reader is not None:
            readers = [serial_reader]
        else:
            readers = [
                SerialLineReader(
                    port=settings.serial_port,
                    baudrate=settings.serial_baud,
                    timeout_seconds=settings.serial_timeout_seconds,
                    reconnect_seconds=settings.serial_reconnect_seconds,
                    max_line_bytes=settings.serial_max_line_bytes,
                )
            ]
        self.serial_readers = readers
        # Kept for callers and tests written against develop's single-link API.
        self.serial_reader = readers[0]

        ports = tuple(
            str(getattr(reader, "port", getattr(settings, "serial_port", "??")))
            for reader in readers
        )
        self.state = state or GatewayState(
            gateway_id=getattr(settings, "device_id", "??"),
            claim_code=getattr(settings, "claim_code", ""),
            transport=getattr(settings, "transport", ""),
            ports=ports,
        )
        self.snapshot_path = (
            snapshot_path
            if snapshot_path is not None
            else getattr(settings, "status_snapshot_path", DEFAULT_SNAPSHOT_PATH)
        )
        self._threads: list[Thread] = []
        self.command_relay = (
            command_relay if command_relay is not None else self._build_command_relay()
        )

    def _build_command_relay(self) -> CommandRelay | None:
        """Build the relay only for a transport with a real command downlink."""

        if not getattr(self.settings, "command_relay_enabled", True):
            LOGGER.info("command relay disabled by configuration")
            return None
        if not isinstance(self.publisher, CommandTransport):
            LOGGER.info(
                "transport %s carries no command downlink; relay not started",
                getattr(self.settings, "transport", "?"),
            )
            return None
        return CommandRelay(
            gateway_id=self.settings.device_id,
            transport=self.publisher,
            outbox=self.outbox,
            state=self.state,
            readers=self.serial_readers,
            journal=CommandJournal(
                self.settings.database_path,
                retention_seconds=getattr(
                    self.settings, "command_journal_retention_seconds", 86_400.0
                ),
            ),
            stop_event=self.stop_event,
            queue_max=getattr(self.settings, "command_queue_max", 32),
            deadman_interval_seconds=getattr(
                self.settings, "command_deadman_interval_seconds", 1.0
            ),
            deadman_grace_seconds=getattr(
                self.settings, "command_deadman_grace_seconds", 5.0
            ),
            max_serial_bytes=getattr(
                self.settings, "command_max_serial_bytes", 120
            ),
        )

    def _critical_workers(self) -> list[tuple[str, Callable[[], None]]]:
        workers: list[tuple[str, Callable[[], None]]] = [
            ("backend-upload", self._upload_loop),
            ("status-snapshot", self._snapshot_loop),
        ]
        if self.command_relay is not None:
            # Losing the relay, its pump deadman, or the ack drain makes an
            # accepted command silently unsafe or untraceable.
            workers.extend(self.command_relay.workers())
            workers.append(("ack-upload", self._ack_upload_loop))
        return workers

    def start(self) -> None:
        self.outbox.initialize()
        pending, dead = self.outbox.counts()
        LOGGER.info("outbox ready pending=%d dead=%d", pending, dead)

        ingest_threads = [
            Thread(
                target=self._ingest_loop,
                args=(reader,),
                name=f"serial-ingest-{index}",
                daemon=True,
            )
            for index, reader in enumerate(self.serial_readers)
        ]
        worker_threads = [
            Thread(target=target, name=name, daemon=True)
            for name, target in self._critical_workers()
        ]
        self._threads = ingest_threads + worker_threads
        for thread in self._threads:
            thread.start()

    def stop(self) -> None:
        self.stop_event.set()

    def join(self) -> None:
        timeout = getattr(self.settings, "http_timeout_seconds", 10.0) + 2.0
        for thread in self._threads:
            thread.join(timeout)
            if thread.is_alive():
                LOGGER.warning("worker did not stop in time name=%s", thread.name)
        self.publisher.close()

    def worker_failed(self) -> bool:
        return bool(self._threads) and any(
            not thread.is_alive() for thread in self._threads
        )

    def _ingest_loop(self, reader: SerialLineReader | None = None) -> None:
        active = reader or self.serial_reader
        try:
            for line in active.lines(self.stop_event):
                self._ingest_line(active.port, line)
        finally:
            self.state.record_link(active.port, up=False)

    def _expected_node_ids(self) -> frozenset[str]:
        plural = getattr(self.settings, "expected_node_ids", None)
        if plural is not None:
            return frozenset(plural)
        singular = getattr(self.settings, "expected_node_id", "")
        return frozenset({singular}) if singular else frozenset()

    def _suggest_irrigation(
        self, event: TelemetryEvent
    ) -> IrrigationSuggestion | None:
        """Size a dose for this reading, or None if it cannot be sized."""

        substrate_volume_ml = self.settings.substrate_volume_ml_for(event.node_id)
        crop_code = self.settings.crop_code_for(event.node_id)
        volume_ml = suggest_volume_ml(
            soil_moisture_pct=event.soil_moisture_pct,
            air_temperature_c=event.air_temperature_c,
            air_humidity_pct=event.relative_humidity_pct,
            ppfd_umol_m2_s=event.ppfd_umol_m2_s,
            soil_temperature_c=event.soil_temperature_c,
            # Delivery-history integration is separate from relaying commands;
            # keep develop's existing suggestion behavior in this extraction.
            hours_since_last_irrigation=None,
            substrate_volume_ml=substrate_volume_ml,
            crop_code=crop_code,
        )
        if volume_ml is None:
            return None
        return IrrigationSuggestion(
            volume_ml=volume_ml,
            model_version=MODEL_VERSION,
            assumed_crop_code=crop_code,
            assumed_substrate_volume_ml=substrate_volume_ml,
        )

    @staticmethod
    def _measurements(event: TelemetryEvent) -> dict[str, float]:
        pairs = (
            ("air_temperature_c", event.air_temperature_c),
            ("air_humidity_pct", event.relative_humidity_pct),
            ("plant_light_ppfd_umol_m2_s", event.ppfd_umol_m2_s),
            ("soil_temperature_c", event.soil_temperature_c),
            ("soil_moisture_pct", event.soil_moisture_pct),
        )
        return {name: float(value) for name, value in pairs if value is not None}

    def _ingest_line(self, port_or_line: str | bytes, line: bytes | None = None) -> None:
        """Route long-key telemetry and short-key command acks on one link."""

        if line is None:
            payload = port_or_line
            if not isinstance(payload, bytes):
                raise TypeError("serial line must be bytes")
            port = str(
                getattr(
                    self.serial_reader,
                    "port",
                    getattr(self.settings, "serial_port", "??"),
                )
            )
        else:
            port = str(port_or_line)
            payload = line

        decoded: dict[str, object] | None = None
        try:
            candidate = json.loads(payload.decode("utf-8", errors="strict"))
            if isinstance(candidate, dict):
                decoded = candidate
        except (UnicodeDecodeError, json.JSONDecodeError):
            # parse_line below produces the established diagnostic.
            pass

        if decoded is not None and "t" in decoded:
            if decoded.get("t") != "ack":
                LOGGER.warning(
                    "discarding short-key serial frame with no handler port=%s t=%s",
                    port,
                    decoded.get("t"),
                )
                self.state.record_error(port)
                return
            if self.command_relay is None:
                LOGGER.warning(
                    "received a command ack with no relay configured port=%s id=%s",
                    port,
                    decoded.get("id"),
                )
                return
            self.command_relay.handle_serial_ack(port, decoded)
            return

        expected_node_ids = self._expected_node_ids()
        expected_node_id = next(iter(expected_node_ids), "")
        try:
            event = parse_line(
                payload,
                context_id=self.settings.crop_context_id,
                expected_node_id=expected_node_id,
                clock_minimum_utc=self.settings.clock_minimum_utc,
            )
        except NonTelemetryMessage as exc:
            announced = None if decoded is None else decoded.get("node_id")
            if isinstance(announced, str) and announced in expected_node_ids:
                self.state.record_announcement(port, announced)
            elif isinstance(announced, str):
                self.state.record_unknown_node(port, announced)
            LOGGER.info("arduino status message type=%s", exc)
            return
        except ProtocolError as exc:
            self.state.record_error(port)
            LOGGER.warning("discarding invalid telemetry reason=%s", exc)
            return

        event = replace(event, irrigation_suggestion=self._suggest_irrigation(event))
        self.state.record_frame(
            port,
            node_id=event.node_id,
            measurements=self._measurements(event),
        )
        try:
            # Telemetry remains the default kind for compatibility with every
            # outbox row created before this port.
            enqueued = self.outbox.enqueue(event)
        except OutboxFullError as exc:
            LOGGER.critical(
                "telemetry dropped because durable outbox is full reason=%s", exc
            )
            return
        if enqueued:
            LOGGER.info(
                "telemetry persisted event_id=%s node_id=%s sequence=%d",
                event.event_id,
                event.node_id,
                event.sequence,
            )

    def _upload_loop(self) -> None:
        while not self.stop_event.is_set():
            uploaded = self._upload_once()
            if uploaded == 0:
                self.stop_event.wait(self.settings.upload_interval_seconds)

    def _ack_upload_loop(self) -> None:
        assert self.command_relay is not None
        while not self.stop_event.is_set():
            uploaded = self._upload_once(
                KIND_ACK,
                send=self.publisher.send_ack,
            )
            if uploaded == 0:
                self.stop_event.wait(self.settings.upload_interval_seconds)

    def _upload_once(
        self,
        kind: str = KIND_TELEMETRY,
        *,
        send: Callable[[object], DeliveryResult] | None = None,
    ) -> int:
        if kind == KIND_TELEMETRY:
            # Preserve the develop call shape for test doubles and old local
            # outbox implementations; Outbox defaults this to telemetry.
            items = self.outbox.due(self.settings.upload_batch_size)
        else:
            items = self.outbox.due(self.settings.upload_batch_size, kind=kind)
        publish = send or self.publisher.send
        processed = 0
        for item in items:
            if self.stop_event.is_set():
                break
            result = publish(item.event)
            processed += 1
            event_id = item.event.event_id
            if result.outcome is Delivery.DELIVERED:
                self.outbox.mark_delivered(event_id)
                self.state.record_transport(connected=True)
                LOGGER.info("%s delivered event_id=%s", kind, event_id)
            elif result.outcome is Delivery.RETRY:
                self.state.record_transport(connected=False, error=result.reason)
                delay = self.outbox.mark_retry(
                    event_id,
                    item.attempts,
                    result.reason,
                    result.retry_after_seconds,
                )
                LOGGER.warning(
                    "%s retry event_id=%s reason=%s delay_seconds=%.1f",
                    kind,
                    event_id,
                    result.reason,
                    delay,
                )
                # Preserve order within this kind without letting telemetry and
                # command outcomes block one another.
                break
            else:
                self.outbox.mark_dead(event_id, result.reason)
                LOGGER.error(
                    "%s quarantined event_id=%s reason=%s",
                    kind,
                    event_id,
                    result.reason,
                )
        return processed

    def _snapshot_loop(self) -> None:
        interval = getattr(self.settings, "status_snapshot_seconds", 1.0)
        while not self.stop_event.is_set():
            try:
                pending, dead = self.outbox.counts()
                self.state.record_outbox(pending, dead)
                write_snapshot(self.snapshot_path, self.state.snapshot())
            except Exception:
                LOGGER.exception("failed to publish dashboard snapshot")
            self.stop_event.wait(interval)
