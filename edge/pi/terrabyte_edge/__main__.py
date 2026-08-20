"""Command line entrypoint for ``python -m terrabyte_edge``."""

from __future__ import annotations

import logging
import argparse
from pathlib import Path
import signal
import sys
from threading import Event

from .config import ConfigError, Settings
from .service import BridgeService
from .state import DEFAULT_SNAPSHOT_PATH


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="?", choices=("run", "dashboard"), default="run")
    parser.add_argument("--snapshot-path", type=Path, default=DEFAULT_SNAPSHOT_PATH)
    parser.add_argument("--windowed", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "dashboard":
        from .ui.dashboard import run
        return run(args.snapshot_path, fullscreen=not args.windowed)

    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2

    _configure_logging(settings.log_level)
    service = BridgeService(settings, snapshot_path=args.snapshot_path)
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
