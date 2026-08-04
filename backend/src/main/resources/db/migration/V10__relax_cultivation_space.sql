UPDATE device SET space_id = (
    SELECT cultivation_space.id FROM cultivation_space
    WHERE cultivation_space.device_id = device.id
);

ALTER TABLE cultivation_space DROP CONSTRAINT uq_cultivation_space_user_id;
ALTER TABLE cultivation_space DROP CONSTRAINT uq_cultivation_space_device_id;
ALTER TABLE cultivation_space DROP CONSTRAINT fk_cultivation_space_device;
ALTER TABLE cultivation_space DROP COLUMN device_id;
