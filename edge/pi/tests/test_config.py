from pathlib import Path
import tempfile
import unittest

from terrabyte_edge.config import ConfigError, Settings


BASE_ENV = {
    "TB_SERIAL_PORT": "/dev/serial/by-id/usb-test",
    "TB_BACKEND_BASE_URL": "https://api.example.test/",
    "TB_CROP_CONTEXT_ID": "ctx/id",
    "TB_DEVICE_ID": "gateway-1",
    "TB_EXPECTED_NODE_ID": "node-1",
    "TB_DEVICE_TOKEN": "secret",
}


class ConfigTests(unittest.TestCase):
    def test_required_settings_and_url_encoding(self) -> None:
        settings = Settings.from_env(BASE_ENV)
        self.assertEqual(settings.serial_baud, 115200)
        self.assertEqual(
            settings.observations_url("ctx/id"),
            "https://api.example.test/api/crop-contexts/ctx%2Fid/environment-observations",
        )

    def test_token_file_is_supported_without_exposing_contents(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "token"
            path.write_text("file-secret\n", encoding="utf-8")
            env = dict(BASE_ENV)
            del env["TB_DEVICE_TOKEN"]
            env["TB_DEVICE_TOKEN_FILE"] = str(path)
            self.assertEqual(Settings.from_env(env).device_token, "file-secret")

    def test_exactly_one_token_source_is_required(self) -> None:
        with self.assertRaises(ConfigError):
            Settings.from_env({key: value for key, value in BASE_ENV.items() if key != "TB_DEVICE_TOKEN"})
        env = dict(BASE_ENV, TB_DEVICE_TOKEN_FILE="/tmp/token")
        with self.assertRaises(ConfigError):
            Settings.from_env(env)

    def test_plain_http_requires_explicit_development_opt_in(self) -> None:
        env = dict(BASE_ENV, TB_BACKEND_BASE_URL="http://127.0.0.1:8080")
        with self.assertRaisesRegex(ConfigError, "TB_ALLOW_INSECURE_HTTP"):
            Settings.from_env(env)
        env["TB_ALLOW_INSECURE_HTTP"] = "true"
        self.assertEqual(
            Settings.from_env(env).backend_base_url,
            "http://127.0.0.1:8080",
        )

    def test_expected_node_id_is_validated(self) -> None:
        with self.assertRaisesRegex(ConfigError, "TB_EXPECTED_NODE_ID"):
            Settings.from_env(dict(BASE_ENV, TB_EXPECTED_NODE_ID="node with space"))


if __name__ == "__main__":
    unittest.main()
