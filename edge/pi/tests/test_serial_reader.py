from threading import Event
import unittest

from terrabyte_edge.serial_reader import SerialLineReader


class FakeSerial:
    def __init__(self, lines):
        self.lines = list(lines)
        self.closed = False

    def readline(self, _size=0):
        if self.lines:
            return self.lines.pop(0)
        return b""

    def close(self):
        self.closed = True


class SerialReaderTests(unittest.TestCase):
    def test_reads_complete_line_and_closes_port(self) -> None:
        handle = FakeSerial([b'{"ok":true}\n'])
        calls = []

        def factory(**kwargs):
            calls.append(kwargs)
            return handle

        reader = SerialLineReader(
            port="/dev/serial/by-id/test",
            baudrate=115200,
            timeout_seconds=1.0,
            reconnect_seconds=0.1,
            max_line_bytes=100,
            factory=factory,
        )
        generator = reader.lines(Event())
        self.assertEqual(next(generator), b'{"ok":true}\n')
        generator.close()

        self.assertTrue(handle.closed)
        self.assertEqual(calls[0]["port"], "/dev/serial/by-id/test")

    def test_oversized_line_is_discarded(self) -> None:
        handle = FakeSerial([b"x" * 101 + b"\n", b'{"ok":true}\n'])
        reader = SerialLineReader(
            port="test",
            baudrate=115200,
            timeout_seconds=1.0,
            reconnect_seconds=0.1,
            max_line_bytes=100,
            factory=lambda **_kwargs: handle,
        )
        generator = reader.lines(Event())
        self.assertEqual(next(generator), b'{"ok":true}\n')
        generator.close()


if __name__ == "__main__":
    unittest.main()
