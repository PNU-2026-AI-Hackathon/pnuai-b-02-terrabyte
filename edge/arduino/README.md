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
- Actuator outputs are driven to their off level in the first statements of
  `setup()`, before serial starts. See the interlock section below.
- The pump MOSFET gate is D4 and the grow-light MOSFET gate is D5, both active
  HIGH. Neither pin is protected between reset and `setup()`, when it is still a
  high-impedance input: only a hardware pull-down on the gate covers that window.

## Actuator hard interlocks

The firmware carries four defences that no inbound command can relax. They are
the last line that survives when the Orange Pi, the broker, and the cloud are
all dead, and they are specified in `docs/design/edge_ai_hardening.md`.

| # | Defence | Default | Behaviour |
| --- | --- | --- | --- |
| G1 | Absolute maximum run | `TB_PUMP_ABS_MAX_MS` 210000 | A larger `ms` is clamped, and the completion reports `stop:"max_runtime"` |
| G2 | Minimum interval between runs | `TB_PUMP_MIN_INTERVAL_MS` 600000 | Measured from the last stop; an earlier command is `rejected`, `r:"cooldown"` |
| G3 | Dead-man watchdog | `TB_HOST_TIMEOUT_MS` 3000 | While the pump runs, silence from the host for this long stops it: `aborted`, `stop:"watchdog"` |
| G4 | Boot safety | — | Both outputs are driven off in the first statements of `setup()`, before `Serial.begin()` |

G1 is 210 s because the measured flow is 500 mL / 510 s = 0.980392 mL/s, so the
server's 200 mL ceiling asks for 204 000 ms. Anything shorter would truncate
every maximum dose and report it as `stop:"max_runtime"`, which looks like a
hardware fault rather than a misconfiguration. The cost is stated plainly in
`TelemetryConfig.h`: against G2 the worst sustained duty rises from 4.8% to
25.9%, and that residue is carried by the server's daily budget, not by G1.

### The grow light is a latch, not a dose

`act:"led"` carries `on:0|1` and no duration. None of G1-G3 transfer as-is:

| | Pump | Grow light |
| --- | --- | --- |
| Absolute maximum run | G1, 210 s | none — light does not accumulate in the pot |
| Minimum interval | G2, 10 min | none — no substrate to recover |
| Dead-man | G3, 3 s | `TB_LED_HOST_TIMEOUT_MS`, 300 s |
| Command-id de-duplication | 8-entry ring | none — a latch is idempotent |

The light id must never enter the pump's ring. Eight light transitions would
evict the pump ids, and a redelivered dose that should have been `duplicate`
would run a second time. That is why `LedGuard` is a separate class rather than
a second latch inside `ActuatorGuard`.

The daily on-time ceiling is a horticultural policy, not a physical interlock,
so it lives on the gateway where it can be weighed against the day's
accumulated DLI. Expressing it here would need a wall clock this board does not
have.

The gateway's light keep-alive must be **slower** than `TB_HOST_TIMEOUT_MS`.
G3 counts bytes and cannot tell which actuator they were meant for, so a 1 Hz
light tick would also feed the pump's dead-man and remove the silence that stops
an orphaned run. A compile-time check enforces
`TB_LED_HOST_TIMEOUT_MS > TB_HOST_TIMEOUT_MS`; the cadence between them is the
gateway's responsibility.

A ring of the last eight accepted command ids makes a redelivered command
`rejected`, `r:"duplicate"` instead of dosing twice. Only accepted ids are
remembered: a command that was refused never ran, so a redelivery is re-judged.

Two boundaries are deliberately outside the firmware:

- **TTL.** The board has no RTC and never compares wall clocks. It handles only
  the relative `ms` in a command; expiry is decided by the Orange Pi.
- **Volume.** There is no flow meter, so a run is timed, never metered. `ml`
  travels with the command for reporting only.

`TB_PUMP_MIN_INTERVAL_MS` must stay shorter than the server's 6-hour cooldown.
The two are managed separately, and if the firmware were the stricter of the two
it would refuse commands the server had already approved, which reaches the user
as an unexplained failure. A compile-time check enforces the 6-hour ceiling.

Relay polarity matters for G4. The design doc specifies "OUTPUT + LOW", which is
only safe on an active-HIGH input; many low-cost relay modules are active LOW and
would turn the pump **on** at boot. Set both levels when wiring such a module:

```cpp
#define TB_PUMP_ON_LEVEL LOW
#define TB_PUMP_OFF_LEVEL HIGH
```

The check is keyed on `HIGH`/`LOW` being defined rather than on `ARDUINO`.
`ARDUINO` is defined for every file in an Arduino build, but `HIGH` and `LOW`
come from `<Arduino.h>`, which the guard translation units deliberately do not
include so they stay host-testable. Keying off `ARDUINO` made `HIGH == LOW`
evaluate as `0 == 0` there and broke the build for the board entirely.

**Verification status:** G1-G4, the duplicate ring and the light latch are
proven by the unit tests under `test/`, including the 10-minute cooldown, ring
eviction, the five-minute light dead-man and the 49.7-day `millis()` rollover.
The firmware also builds for the board (14642 B flash, 805 B SRAM).

**None of it has been verified against real hardware.** The bench scenarios in
`docs/design/edge_ai_hardening.md` (forced stop at 210 s, USB unplugged mid-run,
duplicate id, immediate re-command, reset mid-run) remain outstanding, and so do
the light equivalents: reset with the light on, USB unplugged with the light on,
and a dose commanded while the light is lit.

Do not connect a 12 V load to D4 or D5 yet. An Orange Pi on this bench emitted
smoke on 2026-08-24 and the cause has not been identified; until it is, the
scenarios above run against an indicator LED or a resistive load. Everything but
the two flow-calibration cases is observable that way.

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

To isolate the D3 OneWire bus from the production firmware, upload the
DS18B20-only diagnostic target. It enumerates ROM addresses and reports CRC,
family, device count, temperature, and explicit read-failure states every two
seconds:

```powershell
pio run -e ds18b20_diagnostic -t upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

```powershell
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328old .
arduino-cli upload --fqbn arduino:avr:nano:cpu=atmega328old --port COM5 .
```

For a confirmed Nano Every, its Arduino CLI FQBN remains
`arduino:megaavr:nona4809`.

## Unit tests

The interlock logic and the inbound parser are compiled for the host and tested
off-device:

```powershell
pio test -e native
```

`[env:native]` compiles only the Arduino-free translation units, which is why
`ActuatorGuard` and `CommandParser` must not include `<Arduino.h>` and why the
guard takes `millis()` as an argument instead of calling it. Any new source file
that includes the Arduino core has to be excluded from that environment's
`build_src_filter` as well.

Each suite is an ordinary program with its own `main()`, so it also runs without
PlatformIO:

```powershell
g++ -std=gnu++17 -Wall -Wextra -o guard src/ActuatorGuard.cpp test/test_actuator_guard/test_actuator_guard.cpp
g++ -std=gnu++17 -Wall -Wextra -o parser src/ActuatorGuard.cpp src/CommandParser.cpp test/test_command_parser/test_command_parser.cpp
g++ -std=gnu++17 -Wall -Wextra -o led src/ActuatorGuard.cpp src/LedGuard.cpp test/test_led_guard/test_led_guard.cpp
```

The light suite links `ActuatorGuard.cpp` even though `LedGuard` does not
depend on it: the suite reads `configuredGuardLimits()` to assert that the
light's dead-man is configured apart from the pump's. Leaving it out fails at
link time rather than at compile time.

## Wire protocol

Every record is one UTF-8-compatible ASCII JSON object followed by `\n`. The
firmware writes JSON directly to `Serial` and does not build dynamic `String`
objects.

On each boot it first emits a hello record:

```json
{"message_type":"hello","protocol_version":1,"node_id":"terrabyte-node-001","firmware_version":"0.5.0","serial_baud":115200,"telemetry_interval_ms":5000,"ready":true}
```

A complete, validated sample is emitted as:

```json
{"message_type":"telemetry","protocol_version":1,"node_id":"terrabyte-node-001","sequence":42,"uptime_ms":215000,"air_temperature_c":24.30,"relative_humidity_pct":58.10,"ppfd_umol_m2_s":421.75,"illuminance_lux":18420.83,"soil_temperature_c":19.40,"soil_moisture_pct":63.25,"soil_moisture_raw_adc":527,"actuators":{"pump":0},"pump_lockout_ms":420000}
```

`pump_lockout_ms` is the remaining time until a new pump command could be
accepted, not the configured interval. It counts down to zero, and while a run is
in progress it includes the remaining runtime, because the cooldown has not
started yet. `protocol_version` stays `1`: both keys are additive.

If any core required field is unavailable or invalid, no telemetry is
fabricated. Valid optional soil readings and a sampled raw moisture ADC are
still included for diagnosis:

```json
{"message_type":"sensor_status","protocol_version":1,"node_id":"terrabyte-node-001","sequence":43,"uptime_ms":220000,"validity":{"air_temperature_c":true,"relative_humidity_pct":true,"ppfd_umol_m2_s":false,"illuminance_lux":true,"soil_temperature_c":true,"soil_moisture_pct":false},"illuminance_lux":18420.83,"soil_temperature_c":19.40,"soil_moisture_raw_adc":812,"reason":"sensor_unavailable_or_out_of_range"}
```

Soil probes are optional and never block an otherwise valid telemetry sample.
Each calibrated soil key is emitted only when its adapter is enabled and that
individual reading is valid. `soil_moisture_raw_adc` is emitted whenever the
moisture adapter sampled the ADC, even when the value is outside the calibrated
range and `soil_moisture_pct` is consequently omitted. Invalid optional values
are omitted rather than emitted as `null` or fabricated as zero. The TSL2591 lux
key remains required when its adapter is enabled. The Orange Pi forwards the
optional soil measurements without changing `protocol_version` 1.

`sequence` advances for every scheduled acquisition attempt, so a gap in
telemetry sequence numbers indicates a locally rejected sample. It starts at
zero after every Arduino reboot and wraps after the maximum 32-bit unsigned
value. `uptime_ms` also resets on reboot and is the Arduino monotonic clock. The
Orange Pi should add its own durable event ID and UTC receive timestamp before
forwarding data; `node_id + sequence` is not a permanent idempotency key.

Do not use the Arduino serial output for human-readable debug messages. Extra
text would violate JSONL framing and should instead be represented as a typed
JSON status record.

### Inbound commands and acks

The link is no longer one-way, and the two directions **do not share an envelope
key**. Records the Orange Pi sends use `t`; telemetry records use `message_type`.
The asymmetry is part of the frozen contract, and the parser matches keys with
their surrounding quotes so that `message_type` and `air_temperature_c` cannot be
mistaken for `t`.

Short keys are used inbound because the ATmega328P has 2 KB of SRAM:

```json
{"t":"cmd","id":"01J8F3","act":"pump","ms":18000,"ml":120}
{"t":"ka"}
```

`id` is required and may be up to 26 characters; a longer one is refused rather
than truncated. `act` must be `pump`. `ms` is the run duration and is required.
`ml` is optional and reported only. `{"t":"ka"}` is the **dead-man tick**, sent
every second while the pump runs; it is unrelated to the 30-second MQTT
`dn/heartbeat` despite both being called heartbeats elsewhere.

Every command that carries a readable `id` is answered:

```json
{"t":"ack","id":"01J8F3","ph":"accepted"}
{"t":"ack","id":"01J8F3","ph":"rejected","r":"cooldown"}
{"t":"ack","id":"01J8F3","ph":"completed","ms":17950,"ml":120,"stop":"volume_reached"}
{"t":"ack","id":"01J8F3","ph":"aborted","ms":3020,"ml":120,"stop":"watchdog"}
```

`r` is one of `bad_request`, `duplicate`, `busy`, `cooldown`. `stop` is one of
`volume_reached` (ran the whole requested duration), `max_runtime` (G1 clamped
it), or `watchdog` (G3). These are lower-case firmware-local tokens; the
UPPER_SNAKE `reason` vocabulary belongs to the MQTT contract, and mapping between
them is the Orange Pi's job. A word can mean different things at different
layers, so upstream state should be keyed off `ph`, never off `r`.

`ml` echoes the volume the command asked for, and appears only when the command
carried one. It is a label, not a measurement. `ms` is what actually ran, so on
a `watchdog` abort the two deliberately disagree and the delivered volume has to
be recomputed from `ms`. An analysis that reads `ml` as delivered volume will
over-count exactly the doses that failed.

A line longer than `TB_SERIAL_RX_LINE_MAX` is discarded whole rather than parsed
as a truncated command, and a command whose `id` could not be read is not acked
at all; both surface upstream as a TTL expiry.
