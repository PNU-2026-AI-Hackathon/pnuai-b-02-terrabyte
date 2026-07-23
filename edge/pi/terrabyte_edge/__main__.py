"""Command line entrypoint for ``python -m terrabyte_edge``."""

from __future__ import annotations

import logging
import signal
import sys
from threading import Event

from .config import ConfigError, Settings
from .service import BridgeService


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def main() -> int:
    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2

    _configure_logging(settings.log_level)
    service = BridgeService(settings)
    terminated = Event()

    def request_stop(signum: int, _frame: object) -> None:
        logging.getLogger(__name__).info("shutdown requested signal=%d", signum)
        service.stop()
        terminated.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    try:
        service.start()
        while not terminated.wait(1.0):
            if service.worker_failed():
                raise RuntimeError("worker thread stopped unexpectedly")
    except Exception:
        logging.getLogger(__name__).exception("service stopped unexpectedly")
        return_code = 1
    else:
        return_code = 0
    finally:
        service.stop()
        service.join()
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
