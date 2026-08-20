ALTER TABLE product ADD COLUMN sub_category VARCHAR(20);

UPDATE product SET sub_category = 'SOIL' WHERE id = 'herb-soil';
UPDATE product SET sub_category = 'MEDIA'
WHERE id IN ('perlite', 'coco-peat', 'gravel', 'vermiculite');
UPDATE product SET sub_category = 'NUTRIENT' WHERE id = 'liquid-nutrient';

ALTER TABLE product ADD CONSTRAINT ck_product_sub_category
    CHECK (
        (category = 'soil' AND sub_category IN ('SOIL', 'MEDIA', 'NUTRIENT'))
        OR (category IN ('parts', 'seeds') AND sub_category IS NULL)
    );

CREATE INDEX idx_product_sub_category
    ON product (status, category, sub_category, display_order);
