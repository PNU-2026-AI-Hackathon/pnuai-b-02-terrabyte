// Arduino CLI/IDE sketch entry marker.
// The implementation lives in src/main.cpp and src/SensorAdapter.cpp so the
// same sources are also built by PlatformIO without duplication.
//
// NOTE: src/dataset_logger.cpp is bench tooling, not production firmware, and
// defines its own setup()/loop(). The Arduino IDE compiles src/ recursively and
// will fail with duplicate symbols, so temporarily move that file out of the
// tree for IDE builds. PlatformIO selects between them per environment via
// build_src_filter and is the supported path.

/*
 * Pin map (Arduino Nano-compatible board)
 *
 * Arduino pin | Connected device        | Device pin / purpose
 * ------------|-------------------------|------------------------------
 * D2          | DHT22                   | DATA (TB_DHT22_PIN)
 * D3          | DS18B20 soil probe      | DATA (enabled, 4.7 kohm pull-up)
 * A0          | Capacitive soil sensor  | Analog OUT (enabled; calibrate ADC)
 * A4 / SDA    | TSL2591                 | SDA (I2C, fixed address 0x29)
 * A5 / SCL    | TSL2591                 | SCL (I2C, fixed address 0x29)
 * 5V or 3.3V  | Sensor                  | VCC, per the sensor datasheet
 * GND         | All sensors             | Common GND
 *
 * A bare DHT22 needs the datasheet-recommended pull-up resistor between
 * DATA and VCC. The TSL2591 die is a 3.3 V device, but most breakout boards
 * include a regulator and I2C level shifting; connect VIN according to the
 * specific breakout board rather than assuming its supply voltage.
 */
