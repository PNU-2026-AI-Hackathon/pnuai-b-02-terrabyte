from pathlib import Path
import tempfile
import unittest

from terrabyte_edge.config import ConfigError, Settings


# HTTP transport must be requested explicitly; it carries its own required
# settings (base URL, device token) that MQTT-only deployments should never
# have to provide.
BASE_ENV = {
    "TB_TRANSPORT": "http",
    "TB_SERIAL_PORT": "/dev/serial/by-id/usb-test",
    "TB_BACKEND_BASE_URL": "https://api.example.test/",
    "TB_CROP_CONTEXT_ID": "ctx/id",
    "TB_DEVICE_ID": "gateway-1",
    "TB_EXPECTED_NODE_ID": "node-1",
    "TB_DEVICE_TOKEN": "secret",
}

# Minimal MQTT config (the default transport). Deliberately omits
# TB_BACKEND_BASE_URL / TB_DEVICE_TOKEN to prove they are optional here.
MQTT_ENV = {
    "TB_SERIAL_PORT": "/dev/serial/by-id/usb-test",
    "TB_CROP_CONTEXT_ID": "ctx/id",
    "TB_DEVICE_ID": "gateway-1",
    "TB_EXPECTED_NODE_ID": "node-1",
    "TB_MQTT_HOST": "mqtt.example.test",
}


class ConfigTests(unittest.TestCase):
    def test_required_settings_and_telemetry_url(self) -> None:
        settings = Settings.from_env(BASE_ENV)
        self.assertEqual(settings.serial_baud, 115200)
        self.assertEqual(
            settings.telemetry_url(),
            "https://api.example.test/api/telemetry",
        )

    def test_token_file_is_supported_without_exposing_contents(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "token"
            path.write_text("file-secret\n", encoding="utf-8")
            env = dict(BASE_ENV)
            del env["TB_DEVICE_TOKEN"]
            env["TB_DEVICE_TOKEN_FILE"] = str(path)
            self.assertEqual(Settings.from_env(env).device_token, "file-secret")

    def test_exactly_one_token_source_is_required_under_http_transport(self) -> None:
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

    # --- MQTT transport ---

    def test_mqtt_is_the_default_transport(self) -> None:
        env = {key: value for key, value in MQTT_ENV.items()}
        settings = Settings.from_env(env)
        self.assertEqual(settings.transport, "mqtt")

    def test_mqtt_defaults(self) -> None:
        settings = Settings.from_env(MQTT_ENV)
        self.assertEqual(settings.mqtt_host, "mqtt.example.test")
        self.assertEqual(settings.mqtt_port, 1883)
        self.assertEqual(settings.mqtt_topic_prefix, "tb/v2")
        self.assertEqual(settings.mqtt_keepalive_seconds, 30)
        self.assertEqual(settings.mqtt_publish_timeout_seconds, 10.0)
        self.assertFalse(settings.mqtt_tls)
        self.assertIsNone(settings.mqtt_username)
        self.assertIsNone(settings.mqtt_password)
        self.assertEqual(
            settings.mqtt_telemetry_topic(), "tb/v2/gateway-1/up/telemetry"
        )
        self.assertEqual(settings.mqtt_status_topic(), "tb/v2/gateway-1/up/status")

    def test_http_settings_are_optional_under_mqtt_transport(self) -> None:
        settings = Settings.from_env(MQTT_ENV)
        self.assertEqual(settings.backend_base_url, "")
        self.assertEqual(settings.device_token, "")

    def test_mqtt_requires_host(self) -> None:
        env = {key: value for key, value in MQTT_ENV.items() if key != "TB_MQTT_HOST"}
        with self.assertRaisesRegex(ConfigError, "TB_MQTT_HOST"):
            Settings.from_env(env)

    def test_mqtt_topic_prefix_is_customizable_and_trailing_slash_is_stripped(
        self,
    ) -> None:
        env = dict(MQTT_ENV, TB_MQTT_TOPIC_PREFIX="tb/v3/")
        self.assertEqual(Settings.from_env(env).mqtt_topic_prefix, "tb/v3")

    def test_mqtt_credentials_are_optional(self) -> None:
        env = dict(
            MQTT_ENV, TB_MQTT_USERNAME="gw-gateway-1", TB_MQTT_PASSWORD="hunter2"
        )
        settings = Settings.from_env(env)
        self.assertEqual(settings.mqtt_username, "gw-gateway-1")
        self.assertEqual(settings.mqtt_password, "hunter2")

    def test_invalid_transport_is_rejected(self) -> None:
        env = dict(MQTT_ENV, TB_TRANSPORT="carrier-pigeon")
        with self.assertRaisesRegex(ConfigError, "TB_TRANSPORT"):
            Settings.from_env(env)


if __name__ == "__main__":
    unittest.main()
