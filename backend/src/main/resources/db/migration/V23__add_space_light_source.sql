-- 광원은 기기가 아니라 공간의 속성이다. NULL 은 "모름 또는 미설정"이며
-- 이 경우 space_type 으로 추정한다.
ALTER TABLE cultivation_space ADD COLUMN light_source VARCHAR(30);

ALTER TABLE cultivation_space ADD CONSTRAINT ck_cultivation_space_light_source
    CHECK (light_source IS NULL OR light_source IN
        ('NATURAL_LIGHT', 'INDOOR_LIGHTING', 'WHITE_GROW_LED'));
