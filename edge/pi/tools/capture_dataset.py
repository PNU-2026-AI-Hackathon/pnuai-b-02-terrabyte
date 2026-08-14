"""Capture the bench dataset logger's CSV output to a file.

Bench tooling, not part of the deployed edge service. It talks to the
``dataset_logger`` firmware environment, which does NOT speak the telemetry v1
JSON Lines contract; do not point this at a production node.

    python tools/capture_dataset.py --port /dev/ttyUSB0 --output data/raw/pot-01.csv

The Arduino has no RTC and reports only ``uptime_ms``, so the host stamps each
row with its own wall clock. Rows are appended and flushed immediately: a
multi-day capture should survive the laptop going to sleep or the cable being
kicked out.

Type commands on stdin while it runs (they are forwarded to the firmware):

    w120    mark that 120 mL was just poured into the pot
    m       mark a note row
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import sys
import threading

try:
    import serial  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - operator-facing tool
    sys.exit("pyserial is required: pip install pyserial")


HEADER_PREFIX = "sequence,"


def forward_stdin(port: "serial.Serial", stop: threading.Event) -> None:
    """Relay operator commands to the firmware until stdin closes."""

    for line in sys.stdin:
        if stop.is_set():
            return
        command = line.strip()
        if command:
            port.write((command + "\n").encode("ascii", errors="ignore"))
            port.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="e.g. /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    is_new = not arguments.output.exists() or arguments.output.stat().st_size == 0

    stop = threading.Event()
    with serial.Serial(arguments.port, arguments.baud, timeout=2) as port, \
            arguments.output.open("a", encoding="utf-8") as sink:
        reader = threading.Thread(
            target=forward_stdin, args=(port, stop), daemon=True
        )
        reader.start()

        rows = 0
        try:
            while True:
                raw = port.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                if line.startswith("#"):
                    # Firmware banner: keep it verbatim, it records which build
                    # and which calibration produced the rows that follow.
                    sink.write(line + "\n")
                elif line.startswith(HEADER_PREFIX):
                    if is_new:
                        sink.write("captured_at_utc," + line + "\n")
                        is_new = False
                else:
                    stamp = datetime.now(timezone.utc).isoformat(
                        timespec="seconds"
                    ).replace("+00:00", "Z")
                    sink.write(f"{stamp},{line}\n")
                    rows += 1
                sink.flush()
                print(line, file=sys.stderr)
        except KeyboardInterrupt:
            print(f"\ncaptured {rows} rows to {arguments.output}", file=sys.stderr)
        finally:
            stop.set()


if __name__ == "__main__":
    main()
