UPDATE product
SET badge = '추천'
WHERE badge = '초보 추천';

UPDATE product
SET badge = NULL
WHERE badge = '인기';

ALTER TABLE product ADD CONSTRAINT ck_product_badge
    CHECK (badge IS NULL OR badge = '추천');
