# TerraByte Arduino telemetry node

This firmware reads sensor values and sends newline-delimited JSON (JSONL) to
an Orange Pi over the Arduino USB serial port. The currently probed target is a
classic Nano-compatible ATmega328P board with an old bootloader. A Nano Every
(ATmega4809) build environment remains available for genuinely identified Nano
Every hardware. Neither board needs Wi-Fi because the Orange Pi owns the network
connection.

## Detected board identity

The board connected to the remote Orange Pi was probed directly rather than
identified from its case or an earlier board-name assumption:

- USB serial bridge: CH340
- `avrdude` response: no response at 115200 baud; response at 57600 baud using
  the classic Nano old-bootloader settings
- device signature: `0x1e950f`, which identifies an ATmega328P
- programmer firmware reported by the bootloader path: 1.16

Use the `nano_atmega328_old_bootloader` environment for this physical device.
The 57600 baud value is the bootloader upload speed; application telemetry still
uses 115200 baud after the sketch starts.

## Safety defaults

- Serial speed is `115200` baud and the sampling interval is 5 seconds.
- Startup waits at most 2 seconds for a native USB serial host before emitting
  `hello`; data acquisition continues even when no host is attached.
- Mock sensors are disabled by default and can only be enabled explicitly at
  compile time for an E2E test build.
- DHT22 air temperature and relative humidity are read from digital pin 2.
- A waterproof DS18B20 soil-temperature probe is enabled on digital pin 3.
- An analog capacitive soil-moisture sensor is enabled on A0. Its provisioned
  dry/wet endpoints are provisional placeholders, so the percentage is not
  trustworthy until calibration in real soil; the bench logger retains raw ADC.
- TSL2591 illuminance is read over I2C using A4/SDA and A5/SCL at its fixed
  address, `0x29`.
- PPFD conversion is **disabled in the base defaults**. The provisioned device
  configuration knowingly enables a daylight-spectrum lux estimate so complete
  telemetry can be emitted; this is not a PAR-meter calibration.
- TSL2591 measures illuminance in lux, not PPFD. Lux must not be presented as a
  measured `ppfd_umol_m2_s` value without calibration against a reference
  PAR/PPFD meter using the final light source and geometry.
- `NaN`, infinity, missing readings, and values outside configured ranges are
  rejected. Invalid samples are never sent as telemetry.

## Provisioning

Copy the example configuration and edit the copy:

```powershell
Copy-Item include/TelemetryConfig.local.h.example include/TelemetryConfig.local.h
```

Assign every physical board a stable and unique `TB_NODE_ID`. The local header
is ignored by Git. Allowed characters are letters, numbers, `-`, `_`, `.`, and
`:`, with a maximum length of 64 characters. `UNCONFIGURED` deliberately stops
telemetry publication.

### Sensorless E2E mock mode

To verify the complete Arduino -> Orange Pi -> backend path without connected
sensors, enable the compile-time mock adapter only in the ignored local config:

```cpp
#define TB_NODE_ID "terrabyte-node-001"
#define TB_MOCK_SENSOR_ENABLED 1
```

Mock mode takes precedence over every hardware adapter. It emits a bounded
deterministic triangle wave every scheduled sample: air temperature 22.00-23.20
C, relative humidity 55.00-57.40%, PPFD 360.00-424.00 umol/m^2/s, illuminance
12000-14000 lux, soil temperature 18.00-18.80 C, and soil moisture
48.00-52.00%. Soil fields appear when their corresponding `TB_*_ENABLED`
options are enabled. All fields still pass through the same finite/range
validation and the JSONL
`hello`/`telemetry` path used by real sensors.

`TB_MOCK_SENSOR_ENABLED` defaults to `0` in the checked-in configuration. Never
enable it in provisioned or production firmware; mock records are deliberately
indistinguishable from normal telemetry at the wire-contract level so the E2E
path is tested without special backend behavior.

For a bare DHT22, connect VCC and GND according to the sensor datasheet, connect
DATA to D2 (or the configured `TB_DHT22_PIN`), and add the datasheet-recommended
pull-up resistor between DATA and VCC. Modules often include this resistor.
Never drive an analog input beyond the selected board's electrical limits.

### Soil temperature and moisture

The soil-temperature adapter targets one waterproof DS18B20 probe. Connect DATA
to D3, connect VCC and GND according to the probe datasheet, and add a 4.7 kohm
pull-up resistor between DATA and VCC:

```cpp
#define TB_SOIL_TEMPERATURE_ENABLED 1
#define TB_SOIL_TEMPERATURE_PIN 3
```

The soil-moisture adapter targets an analog capacitive sensor. Connect its
analog output to A0, then measure raw ADC readings in representative dry and wet
soil with the final supply voltage, board, and probe. Configure those measured
endpoints; the conversion supports either ADC direction:

```cpp
#define TB_SOIL_MOISTURE_ENABLED 1
#define TB_SOIL_MOISTURE_ADC_PIN A0
#define TB_SOIL_MOISTURE_DRY_ADC 800  // Example syntax only.
#define TB_SOIL_MOISTURE_WET_ADC 350  // Replace both with measured values.
```

The calculation maps the dry endpoint to 0% and the wet endpoint to 100%.
Samples outside the calibrated ADC interval, disconnected DS18B20 probes, and
out-of-range values produce `sensor_status` instead of fabricated telemetry.

### TSL2591 illuminance and optional PPFD calibration

Connect the TSL2591 breakout to the Nano I2C pins. The TSL2591 die is a 3.3 V
device, but most breakouts include a regulator and I2C level shifting. Connect
VIN according to the specific breakout board's rated supply voltage:

| TSL2591 | Arduino Nano | Purpose |
| --- | --- | --- |
| `GND` | `GND` | Common ground |
| `SDA` | `A4` / `SDA` | I2C data |
| `SCL` | `A5` / `SCL` | I2C clock |
| `VIN` | Rated supply | Breakout power |

The address is fixed at `0x29`. The default configuration uses 25x gain, a
300 ms integration period, and bounded auto-gain:

```cpp
#define TB_TSL2591_ENABLED 1
#define TB_TSL2591_I2C_ADDRESS 0x29
#define TB_TSL2591_GAIN 25
#define TB_TSL2591_INTEGRATION_MS 300
#define TB_TSL2591_AUTO_GAIN_ENABLED 1
```

The firmware reports the validated TSL2591 reading as `illuminance_lux`. To
additionally produce PPFD, calibration must provide the conversion coefficients
and calibrated lux bounds:

```cpp
#define TB_PPFD_CALIBRATION_ENABLED 1
#define TB_PPFD_PER_LUX 0.0123f
#define TB_PPFD_OFFSET -1.25f
#define TB_PPFD_CALIBRATED_MIN_LUX 100.0f
#define TB_PPFD_CALIBRATED_MAX_LUX 50000.0f
```

The calculation is:

```text
PPFD (umol/m^2/s) = illuminance lux * TB_PPFD_PER_LUX + TB_PPFD_OFFSET
```

The numbers above only demonstrate syntax; they are not calibration values and
must not be copied to a device. The minimum and maximum are the lux range
actually covered by calibration; saturated or extrapolated readings outside it
are rejected. Calibration is sensor, spectrum, geometry, and light-source
dependent. DHT22 readings and the final PPFD conversion must also be checked
against references before calling the combined payload `perfect_calibrated_v1`.

For a digital PPFD sensor or a different sensor set, keep the `SensorSample`
contract and replace the hardware-specific code in `src/SensorAdapter.cpp`.
Set a validity bit only after the corresponding hardware read succeeds.

## Build and upload with PlatformIO

Install PlatformIO, connect the board with a USB **data** cable, then run from
this directory for the probed ATmega328P old-bootloader board:

```powershell
pio run -e nano_atmega328_old_bootloader
pio run -e nano_atmega328_old_bootloader --target upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

On the Orange Pi, replace `COM5` with the stable device path (prefer
`/dev/serial/by-id/...`; CH340 adapters may otherwise appear as
`/dev/ttyUSB0`). Do not copy a port blindly: confirm the target again before
uploading.

For a board independently confirmed as a real Nano Every, select the preserved
environment explicitly:

```powershell
pio run -e nano_every
pio run -e nano_every --target upload --upload-port COM5
```

PlatformIO installs the pinned-compatible Adafruit DHT, OneWire, and Dallas
Temperature libraries and their dependencies. Arduino CLI users can compile
and upload to the probed classic Nano using the old-bootloader FQBN after
installing the AVR core and those libraries:

```powershell
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328old .
arduino-cli upload --fqbn arduino:avr:nano:cpu=atmega328old --port COM5 .
```

For a confirmed Nano Every, its Arduino CLI FQBN remains
`arduino:megaavr:nona4809`.

## Wire protocol

Every record is one UTF-8-compatible ASCII JSON object followed by `\n`. The
firmware writes JSON directly to `Serial` and does not build dynamic `String`
objects.

On each boot it first emits a hello record:

```json
{"message_type":"hello","protocol_version":1,"node_id":"terrabyte-node-001","firmware_version":"0.3.0","serial_baud":115200,"telemetry_interval_ms":5000,"ready":true}
```

A complete, validated sample is emitted as:

```json
{"message_type":"telemetry","protocol_version":1,"node_id":"terrabyte-node-001","sequence":42,"uptime_ms":215000,"air_temperature_c":24.30,"relative_humidity_pct":58.10,"ppfd_umol_m2_s":421.75,"illuminance_lux":18420.83,"soil_temperature_c":19.40,"soil_moisture_pct":63.25}
```

If any required field is unavailable or invalid, no telemetry is fabricated:

```json
{"message_type":"sensor_status","protocol_version":1,"node_id":"terrabyte-node-001","sequence":43,"uptime_ms":220000,"validity":{"air_temperature_c":true,"relative_humidity_pct":true,"ppfd_umol_m2_s":false,"illuminance_lux":true,"soil_temperature_c":true,"soil_moisture_pct":true},"illuminance_lux":18420.83,"reason":"sensor_unavailable_or_out_of_range"}
```

The two soil keys are emitted only when their adapters are enabled. The TSL2591
lux key is emitted when its adapter is enabled, including in `sensor_status`
when PPFD calibration is unavailable. The current Orange Pi/backend v1 contract
accepts the serial record but forwards only air temperature, relative humidity,
and calibrated PPFD. Persisting lux or soil measurements requires a separately
versioned edge/backend contract instead of silently relabelling an existing
field.

`sequence` advances for every scheduled acquisition attempt, so a gap in
telemetry sequence numbers indicates a locally rejected sample. It starts at
zero after every Arduino reboot and wraps after the maximum 32-bit unsigned
value. `uptime_ms` also resets on reboot and is the Arduino monotonic clock. The
Orange Pi should add its own durable event ID and UTC receive timestamp before
forwarding data; `node_id + sequence` is not a permanent idempotency key.

Do not use the Arduino serial output for human-readable debug messages. Extra
text would violate JSONL framing and should instead be represented as a typed
JSON status record.
