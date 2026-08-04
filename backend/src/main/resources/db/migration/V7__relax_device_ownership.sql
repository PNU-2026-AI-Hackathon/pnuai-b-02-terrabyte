ALTER TABLE device DROP CONSTRAINT uq_device_user_id;

ALTER TABLE device ADD COLUMN space_id BIGINT;
ALTER TABLE device ADD CONSTRAINT fk_device_space
    FOREIGN KEY (space_id) REFERENCES cultivation_space (id) ON DELETE SET NULL;

ALTER TABLE device ADD COLUMN claim_code VARCHAR(6);
ALTER TABLE device ADD COLUMN claimed_at TIMESTAMP WITH TIME ZONE;
CREATE UNIQUE INDEX uq_device_claim_code ON device (claim_code);
UPDATE device SET claim_code = serial_code;
ALTER TABLE device ADD CONSTRAINT ck_device_claim_code_length
    CHECK (claim_code IS NULL OR CHAR_LENGTH(claim_code) = 6);

ALTER TABLE device ADD COLUMN mqtt_username VARCHAR(100);
ALTER TABLE device ADD COLUMN mqtt_password_hash VARCHAR(255);
ALTER TABLE device ADD COLUMN credential_revoked_at TIMESTAMP WITH TIME ZONE;
CREATE UNIQUE INDEX uq_device_mqtt_username ON device (mqtt_username);
UPDATE device SET mqtt_username = 'gw-' || hardware_id WHERE hardware_id IS NOT NULL;

UPDATE device SET claimed_at = created_at WHERE user_id IS NOT NULL;
