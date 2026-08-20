ALTER TABLE product ADD COLUMN package_quantity NUMERIC(10, 2);
ALTER TABLE product ADD COLUMN package_unit VARCHAR(10);

UPDATE product SET package_quantity = 1, package_unit = '개' WHERE id IN (
    'grow-light', 'soil-probe', 'power-adapter', 'mist-sprayer',
    'self-watering-pot', 'soil-meter'
);
UPDATE product SET package_quantity = 1, package_unit = '세트' WHERE id = 'watering-kit';
UPDATE product SET package_quantity = 10, package_unit = 'L' WHERE id = 'herb-soil';
UPDATE product SET package_quantity = 3, package_unit = 'L' WHERE id IN ('perlite', 'vermiculite');
UPDATE product SET package_quantity = 5, package_unit = 'L' WHERE id IN ('coco-peat', 'gravel');
UPDATE product SET package_quantity = 500, package_unit = 'ml' WHERE id = 'liquid-nutrient';
UPDATE product SET package_quantity = 12, package_unit = '구' WHERE id = 'seedling-tray';
UPDATE product SET package_quantity = 100, package_unit = '립' WHERE id IN ('basil-seeds', 'cherry-tomato-seeds');
UPDATE product SET package_quantity = 1000, package_unit = '립' WHERE id = 'lettuce-seeds';
UPDATE product SET package_quantity = 3000, package_unit = '립' WHERE id = 'arugula-seeds';
UPDATE product SET package_quantity = 300, package_unit = '립' WHERE id IN ('coriander-seeds', 'peppermint-seeds');
UPDATE product SET package_quantity = 3, package_unit = 'g' WHERE id = 'welsh-onion-seeds';
UPDATE product SET package_quantity = 1, package_unit = '개' WHERE id = 'outlet-timer';

UPDATE product SET price = 3600 WHERE id = 'lettuce-seeds';
UPDATE product SET price = 3000 WHERE id = 'coriander-seeds';
UPDATE product SET price = 2500 WHERE id = 'welsh-onion-seeds';
UPDATE product SET price = 3800 WHERE id = 'peppermint-seeds';

ALTER TABLE product ALTER COLUMN package_quantity SET NOT NULL;
ALTER TABLE product ALTER COLUMN package_unit SET NOT NULL;

ALTER TABLE product ADD CONSTRAINT ck_product_package_quantity CHECK (package_quantity > 0);
ALTER TABLE product ADD CONSTRAINT ck_product_package_unit
    CHECK (package_unit IN ('개', '세트', 'L', 'ml', 'g', '립', '구'));
