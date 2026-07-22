ALTER TABLE device ADD COLUMN hardware_id VARCHAR(100);

CREATE UNIQUE INDEX uq_device_hardware_id ON device (hardware_id);

UPDATE device SET hardware_id = 'orangepi-pro-01' WHERE serial_code = '483920';
UPDATE device SET hardware_id = 'orangepi-pro-02' WHERE serial_code = '123456';
