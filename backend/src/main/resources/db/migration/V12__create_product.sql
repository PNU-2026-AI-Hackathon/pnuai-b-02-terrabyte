CREATE TABLE product (
    id VARCHAR(64) PRIMARY KEY,
    category VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    emoji VARCHAR(20) NOT NULL,
    description VARCHAR(300) NOT NULL,
    price INTEGER NOT NULL,
    badge VARCHAR(30),
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    image_url VARCHAR(500),
    display_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_name UNIQUE (name),
    CONSTRAINT uq_product_display_order UNIQUE (display_order),
    CONSTRAINT ck_product_category CHECK (category IN ('parts', 'soil', 'seeds')),
    CONSTRAINT ck_product_price CHECK (price > 0),
    CONSTRAINT ck_product_stock_quantity CHECK (stock_quantity >= 0),
    CONSTRAINT ck_product_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
    CONSTRAINT ck_product_display_order CHECK (display_order > 0)
);

CREATE INDEX idx_product_catalog
    ON product (status, category, display_order);

INSERT INTO product (
    id, category, name, emoji, description, price, badge,
    stock_quantity, status, display_order
) VALUES
    ('grow-light', 'parts', '식물 생장등 (LED)', '💡', '실내 재배 공간에 설치하기 좋은 바 타입 조명', 29900, '추천', 25, 'ACTIVE', 1),
    ('watering-kit', 'parts', '자동 관수 키트', '💧', '설정한 주기에 맞춰 물을 공급하는 소형 관수 세트', 39900, '추천', 18, 'ACTIVE', 2),
    ('soil-probe', 'parts', '토양 수분 센서 프로브', '🌡️', '기존 기기에 연결해 교체할 수 있는 센서 프로브', 12900, NULL, 40, 'ACTIVE', 3),
    ('power-adapter', 'parts', 'USB-C 전원 어댑터', '🔌', '센서와 관수 장치에 사용할 수 있는 전원 어댑터', 9900, NULL, 50, 'ACTIVE', 4),
    ('herb-soil', 'soil', '실내 허브용 배양토 10L', '🪴', '허브와 잎채소 화분에 바로 사용할 수 있는 배양토', 8900, '인기', 32, 'ACTIVE', 5),
    ('perlite', 'soil', '펄라이트 3L', '⚪', '배수성과 통기성을 보완할 때 섞어 쓰는 토양 개량재', 4900, NULL, 45, 'ACTIVE', 6),
    ('coco-peat', 'soil', '코코피트 블록 5L', '🥥', '물을 흡수하면 부피가 늘어나는 가벼운 재배 배지', 5900, NULL, 38, 'ACTIVE', 7),
    ('gravel', 'soil', '마사토 소립 5L', '🪨', '화분 바닥 배수층과 흙 배합에 활용하는 소립 마사토', 6900, NULL, 35, 'ACTIVE', 8),
    ('vermiculite', 'soil', '버미큘라이트 3L', '🟤', '수분과 양분 보유력을 높여 건조가 빠른 배지를 보완하는 토양 개량재', 5900, NULL, 36, 'ACTIVE', 9),
    ('basil-seeds', 'seeds', '바질 씨앗', '🌿', '향긋한 잎을 수확하는 실내 허브 재배용 씨앗', 3500, '초보 추천', 100, 'ACTIVE', 10),
    ('lettuce-seeds', 'seeds', '상추 씨앗', '🥬', '화분과 소형 재배기에서 키우기 좋은 잎채소 씨앗', 3000, NULL, 100, 'ACTIVE', 11),
    ('arugula-seeds', 'seeds', '루꼴라 씨앗', '🥗', '톡 쏘는 풍미의 어린잎을 재배할 수 있는 씨앗', 3900, NULL, 80, 'ACTIVE', 12),
    ('coriander-seeds', 'seeds', '고수 씨앗', '☘️', '독특한 향의 잎과 줄기를 수확하는 허브 씨앗', 3500, NULL, 75, 'ACTIVE', 13),
    ('welsh-onion-seeds', 'seeds', '대파 씨앗', '🧅', '베란다와 텃밭 화분에서 재배할 수 있는 채소 씨앗', 3000, NULL, 85, 'ACTIVE', 14),
    ('peppermint-seeds', 'seeds', '페퍼민트 씨앗', '🌱', '상쾌한 향을 즐길 수 있는 다년생 허브 씨앗', 3500, NULL, 70, 'ACTIVE', 15),
    ('outlet-timer', 'parts', '디지털 콘센트 타이머', '⏱️', '생장등과 관수 장치의 작동 시간을 요일별로 설정하는 타이머', 24900, '추천', 24, 'ACTIVE', 16),
    ('mist-sprayer', 'parts', '미세 안개 분무기 500ml', '🚿', '어린잎과 습도 관리에 사용하는 연속 분사형 원예 분무기', 9900, NULL, 42, 'ACTIVE', 17),
    ('self-watering-pot', 'parts', '저면관수 화분 세트', '🪴', '물 저장부에서 필요한 만큼 수분을 흡수하는 실내용 화분', 13900, '초보 추천', 28, 'ACTIVE', 18),
    ('soil-meter', 'parts', '토양 pH·수분 측정기', '📟', '전원 없이 토양 산도와 수분 상태를 확인하는 원예용 측정기', 21900, '추천', 20, 'ACTIVE', 19),
    ('liquid-nutrient', 'soil', '실내 식물 액체 영양제 500ml', '🧪', '허브와 잎채소에 희석해 사용하는 원예용 액체 영양제', 7900, NULL, 34, 'ACTIVE', 20),
    ('seedling-tray', 'parts', '뚜껑형 모종 트레이 12구', '🌱', '씨앗 발아와 어린 모종 육묘에 사용하는 미니 온실 트레이', 4900, NULL, 40, 'ACTIVE', 21),
    ('cherry-tomato-seeds', 'seeds', '방울토마토 씨앗', '🍅', '베란다 화분과 소형 스마트팜에서 기르기 좋은 씨앗', 3500, '인기', 90, 'ACTIVE', 22);
