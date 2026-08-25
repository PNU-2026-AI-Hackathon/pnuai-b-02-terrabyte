-- 표기 통일: 작물 코드와 점수 경계는 유지하고 한국어 표시명만 변경한다.
-- 점수 프로필은 일반적으로 불변이지만, 이 마이그레이션은 수치나 근거를
-- 변경하지 않는 명칭 정정이므로 트리거를 잠시 재생성한다.
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

DROP TRIGGER IF EXISTS crop_score_profile_immutable_update;
DROP TRIGGER IF EXISTS crop_score_profile_immutable_delete;

UPDATE crop_score_profile
SET crop_name_ko = '루꼴라',
    source_summary = REPLACE(source_summary, char(50500, 47336, 44852, 46972), '루꼴라')
WHERE crop_code = 'arugula';

CREATE TRIGGER crop_score_profile_immutable_update
BEFORE UPDATE ON crop_score_profile BEGIN
  SELECT RAISE(ABORT,'score profiles are immutable: insert a new version');
END;

CREATE TRIGGER crop_score_profile_immutable_delete
BEFORE DELETE ON crop_score_profile BEGIN
  SELECT RAISE(ABORT,'score profiles are immutable: keep historical score profiles');
END;

COMMIT;
