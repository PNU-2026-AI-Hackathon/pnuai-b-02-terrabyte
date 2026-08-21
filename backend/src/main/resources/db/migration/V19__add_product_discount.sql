ALTER TABLE product ADD COLUMN discount_rate INTEGER NOT NULL DEFAULT 0;

UPDATE product
SET discount_rate = 10
WHERE badge = '추천';

ALTER TABLE product ADD CONSTRAINT ck_product_discount_rate
    CHECK (discount_rate BETWEEN 0 AND 90);

ALTER TABLE shop_order_item ADD COLUMN original_unit_price INTEGER;
ALTER TABLE shop_order_item ADD COLUMN discount_rate INTEGER NOT NULL DEFAULT 0;

UPDATE shop_order_item
SET original_unit_price = unit_price;

ALTER TABLE shop_order_item ALTER COLUMN original_unit_price SET NOT NULL;

ALTER TABLE shop_order_item ADD CONSTRAINT ck_shop_order_item_original_unit_price
    CHECK (original_unit_price > 0);
ALTER TABLE shop_order_item ADD CONSTRAINT ck_shop_order_item_discount_rate
    CHECK (discount_rate BETWEEN 0 AND 90);
