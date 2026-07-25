-- 웹 재검증한 생육환경 경계 프로필 v2.
-- v1은 과거 컨텍스트 재현을 위해 보존하고 activation만 v2로 전환한다.

PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

INSERT OR IGNORE INTO crop_score_profile VALUES
  ('basil-general-v2','basil','바질','warm_herb','general_vegetative',
   7,18,29,36, 30,50,80,95, 0,260,600,1000,16,
   40,25,35,'A','C','A','hybrid',
   'FAO 7/18-27/36°C와 바질 29°C 생육시험; DLI 15-25 및 500-600 PPFD 시험; RH 50-80 CEA 일반범위와 85% 이상 노균병 위험',
   '2.0.0','2026-07-25T00:00:00Z'),
  ('peppermint-general-v2','peppermint','페퍼민트','moderate_light_herb','general_vegetative',
   4,15,25,35, 30,50,80,95, 0,150,200,250,14,
   40,25,35,'B','C','A','hybrid',
   'FAO 4/15-25/35°C; Mentha 150-200 PPFD 적합 및 250 PPFD 스트레스 시험; RH는 CEA 일반범위',
   '2.0.0','2026-07-25T00:00:00Z'),
  ('cherry-tomato-general-v2','cherry_tomato','방울토마토','warm_fruiting','general_fruiting',
   7,18.5,26.5,35, 30,65,75,90, 0,300,521,800,16,
   40,25,35,'B','B','B','general_reference',
   'FAO 절대 7-35°C와 온실 토마토 18.5-26.5°C·RH 65-75%; 토마토 DLI 20-30 및 300 PPFD 효율 시험',
   '2.0.0','2026-07-25T00:00:00Z'),
  ('welsh-onion-general-v2','welsh_onion','대파','cool_leafy_herb','general_vegetative',
   6,12,25,30, 30,50,80,95, 0,208,347,600,16,
   40,25,35,'B','C','C','category_fallback',
   'FAO 대파 절대 6-30°C·최적 12-25°C; RH와 PPFD는 직접 구배시험 부재로 CEA·엽채류 휴리스틱 유지',
   '2.0.0','2026-07-25T00:00:00Z'),
  ('arugula-general-v2','arugula','아루굴라','cool_leafy_herb','general_vegetative',
   8,15,25,29, 30,50,80,95, 0,200,250,600,16,
   40,25,35,'B','C','A','hybrid',
   'FAO 아루굴라 절대 8-29°C·최적 15-25°C; 성숙 로켓 250 PPFD·DLI 14.4 비교시험; RH는 CEA 일반범위',
   '2.0.0','2026-07-25T00:00:00Z'),
  ('wasabi-general-v2','wasabi','와사비','cool_shade','general_vegetative',
   5,12,18,26, 40,60,80,95, 0,90,140,250,12,
   40,25,35,'B','C','A','hybrid',
   '와사비 5°C 야간 생육정체·12-18°C 적온·고온 민감성; Daruma 90-140 PPFD 고광합성·140 PPFD 최고 생체중; RH 68% 시험조건',
   '2.0.0','2026-07-25T00:00:00Z'),
  ('lettuce-general-v2','lettuce','상추','cool_leafy_herb','general_vegetative',
   5,12,24,30, 30,60,75,90, 0,200,295,500,16,
   40,25,35,'B','B','A','hybrid',
   'FAO 절대 5-30°C·최적 12-21°C와 CEA 24°C 효율시험; RH 70-75% 연구; 상추 DLI 12-17을 16h PPFD로 환산',
   '2.0.0','2026-07-25T00:00:00Z'),
  ('coriander-general-v2','coriander','고수','cool_leafy_herb','fresh_leaf',
   4,15,26,32, 30,50,70,90, 0,200,200,400,16,
   40,25,35,'B','C','A','hybrid',
   'FAO 절대 4-32°C·최적 15-25°C와 표준 고수 약 26°C 생체중 최적; 200 PPFD·16h 직접 권고; RH는 CEA 일반범위',
   '2.0.0','2026-07-25T00:00:00Z');

UPDATE crop_score_profile_activation
SET profile_id = CASE crop_code
  WHEN 'basil' THEN 'basil-general-v2'
  WHEN 'peppermint' THEN 'peppermint-general-v2'
  WHEN 'cherry_tomato' THEN 'cherry-tomato-general-v2'
  WHEN 'welsh_onion' THEN 'welsh-onion-general-v2'
  WHEN 'arugula' THEN 'arugula-general-v2'
  WHEN 'wasabi' THEN 'wasabi-general-v2'
  WHEN 'lettuce' THEN 'lettuce-general-v2'
  WHEN 'coriander' THEN 'coriander-general-v2'
END,
activated_at_utc = '2026-07-25T00:00:00Z';

COMMIT;
