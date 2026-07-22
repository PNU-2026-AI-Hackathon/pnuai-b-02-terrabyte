INSERT INTO device (serial_code)
SELECT '123456'
WHERE NOT EXISTS (
    SELECT 1 FROM device WHERE serial_code = '123456'
);
