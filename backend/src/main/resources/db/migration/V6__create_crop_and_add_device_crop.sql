CREATE TABLE crop (
    code VARCHAR(50) PRIMARY KEY,
    name_ko VARCHAR(50) NOT NULL,
    emoji VARCHAR(20) NOT NULL,
    description VARCHAR(200) NOT NULL,
    display_order INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_crop_name_ko UNIQUE (name_ko),
    CONSTRAINT uq_crop_display_order UNIQUE (display_order),
    CONSTRAINT ck_crop_display_order CHECK (display_order > 0)
);

INSERT INTO crop (code, name_ko, emoji, description, display_order) VALUES
    ('cherry_tomato', '방울토마토', '🍅', '초보자에게 인기 있는 실내 작물', 1),
    ('lettuce', '상추', '🥬', '빠르게 자라고 관리가 쉬워요', 2),
    ('basil', '바질', '🌿', '햇빛을 좋아하는 허브', 3),
    ('peppermint', '페퍼민트', '🌱', '상쾌한 향이 특징인 허브', 4),
    ('welsh_onion', '대파', '🧅', '잎과 줄기를 활용하는 향신 채소', 5),
    ('arugula', '루꼴라', '🥗', '톡 쏘는 풍미가 특징인 잎채소', 6),
    ('wasabi', '와사비', '🌿', '알싸한 맛이 특징인 향신 작물', 7),
    ('coriander', '고수', '☘️', '독특한 향을 지닌 향신 허브', 8);

ALTER TABLE device ADD COLUMN crop_code VARCHAR(50);
ALTER TABLE device ADD COLUMN crop_selected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE device ADD CONSTRAINT fk_device_crop
    FOREIGN KEY (crop_code) REFERENCES crop (code);

ALTER TABLE device ADD CONSTRAINT ck_device_crop_selection
    CHECK ((crop_code IS NULL AND crop_selected_at IS NULL)
        OR (crop_code IS NOT NULL AND crop_selected_at IS NOT NULL));
