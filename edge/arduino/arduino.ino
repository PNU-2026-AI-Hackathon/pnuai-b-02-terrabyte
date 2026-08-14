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
 * D3          | DS18B20 soil probe      | DATA (optional, 4.7 kohm pull-up)
 * A1          | Capacitive soil sensor  | Analog OUT (optional, calibrated)
 * A4 / SDA    | GY-30 (BH1750)          | SDA (I2C data)
 * A5 / SCL    | GY-30 (BH1750)          | SCL (I2C clock)
 * 5V or 3.3V  | Sensor                  | VCC, per the sensor datasheet
 * GND         | All sensors             | Common GND
 *
 * A bare DHT22 needs the datasheet-recommended pull-up resistor between
 * DATA and VCC. Connect GY-30 ADD to GND for address 0x23 (default), or VCC
 * for address 0x5C and set TB_GY30_I2C_ADDRESS accordingly. Soil sensors are
 * disabled until their TB_*_ENABLED options are set to 1.
 */
