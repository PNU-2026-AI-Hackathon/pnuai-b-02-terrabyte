ALTER TABLE device DROP CONSTRAINT ck_device_crop_selection;
ALTER TABLE device DROP CONSTRAINT fk_device_crop;
ALTER TABLE device DROP COLUMN crop_selected_at;
ALTER TABLE device DROP COLUMN crop_code;
