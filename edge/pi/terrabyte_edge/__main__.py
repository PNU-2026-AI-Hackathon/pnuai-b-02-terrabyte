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


def _print_status(snapshot_path: Path, watch: float | None) -> int:
    """The board as text, for an operator on an SSH session with no browser."""

    import time

    from .state import read_snapshot
    from .ui.render import build_view
    from .ui.text import render

    while True:
        view = build_view(read_snapshot(snapshot_path), now_epoch=time.time())
        if watch:
            # Clear and home, so a watched board overwrites itself instead of
            # scrolling. Plain ANSI, no curses: this has to work over a dumb pipe.
            print("[2J[H", end="")
        print(render(view))
        if not watch:
            return 0
        try:
            time.sleep(max(0.5, watch))
        except KeyboardInterrupt:
            return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command", nargs="?", choices=("run", "status", "dashboard"), default="run"
    )
    parser.add_argument("--snapshot-path", type=Path, default=DEFAULT_SNAPSHOT_PATH)
    parser.add_argument("--windowed", action="store_true")
    # Loopback by default. The board is read-only but unauthenticated, and it
    # names the pots. Exposing it is an explicit choice.
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument(
        "--text",
        action="store_true",
        help="print the board once to stdout instead of serving it",
    )
    parser.add_argument(
        "--watch",
        type=float,
        metavar="SECONDS",
        help="with --text, reprint on this interval until interrupted",
    )
    args = parser.parse_args(argv)
    if args.command == "status":
        if args.text:
            return _print_status(args.snapshot_path, args.watch)
        from .ui.web import serve
        return serve(args.snapshot_path, host=args.host, port=args.port)
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
