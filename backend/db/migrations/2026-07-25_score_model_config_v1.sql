PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

-- 가중 기하평균 구조를 준비하되 모든 기존 프로필은 1/1/1 동일가중으로
-- 시드한다. 기존 crop_score_profile의 40/25/35 열은 legacy 조화평균용이다.
CREATE TABLE IF NOT EXISTS crop_score_model_config (
  model_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  crop_code TEXT NOT NULL,
  contract_version TEXT NOT NULL CHECK (contract_version='score-v1'),
  aggregation_family TEXT NOT NULL CHECK (aggregation_family IN (
    'equal_geometric_v1','weighted_geometric_v1')),
  temperature_exponent REAL NOT NULL
    CHECK (temperature_exponent > 0 AND temperature_exponent <= 100),
  humidity_exponent REAL NOT NULL
    CHECK (humidity_exponent > 0 AND humidity_exponent <= 100),
  plant_light_exponent REAL NOT NULL
    CHECK (plant_light_exponent > 0 AND plant_light_exponent <= 100),
  curve_family TEXT NOT NULL CHECK (curve_family='trapezoid_v1'),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('draft','validated')),
  evidence_revision TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  FOREIGN KEY (profile_id, crop_code)
    REFERENCES crop_score_profile(profile_id, crop_code),
  UNIQUE (profile_id, contract_version),
  UNIQUE (model_id, crop_code),
  CHECK (aggregation_family <> 'equal_geometric_v1'
    OR (temperature_exponent = humidity_exponent
      AND humidity_exponent = plant_light_exponent))
) STRICT, WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS crop_score_model_config_immutable_update
BEFORE UPDATE ON crop_score_model_config BEGIN
  SELECT RAISE(ABORT,'score model configs are immutable: insert a new profile version');
END;

CREATE TRIGGER IF NOT EXISTS crop_score_model_config_immutable_delete
BEFORE DELETE ON crop_score_model_config BEGIN
  SELECT RAISE(ABORT,'score model configs are immutable: insert a new profile version');
END;

INSERT OR IGNORE INTO crop_score_model_config
  (model_id,profile_id,crop_code,contract_version,aggregation_family,
   temperature_exponent,humidity_exponent,plant_light_exponent,curve_family,
   validation_status,evidence_revision,change_reason,created_at_utc)
SELECT profile_id || '-score-v1', profile_id, crop_code, 'score-v1',
       'equal_geometric_v1', 1.0, 1.0, 1.0, 'trapezoid_v1', 'validated',
       'aggregation-baseline-2026-07-25',
       '기존 1/3·1/3·1/3 기하평균과 사다리꼴 축 점수를 변경 없이 명시',
       '2026-07-25T00:00:00Z'
FROM crop_score_profile;

DROP VIEW IF EXISTS latest_crop_environment_score;
DROP VIEW IF EXISTS crop_environment_score;

CREATE VIEW crop_environment_score AS
WITH modeled AS (
  SELECT a.*,
         m.model_id,
         m.aggregation_family,
         m.temperature_exponent,
         m.humidity_exponent,
         m.plant_light_exponent,
         m.curve_family,
         (m.temperature_exponent
          + m.humidity_exponent
          + m.plant_light_exponent) AS exponent_sum
  FROM crop_environment_axis_score AS a
  JOIN crop_score_model_config AS m
    ON m.profile_id=a.profile_id
   AND m.crop_code=a.crop
   AND m.contract_version='score-v1'
   AND m.validation_status='validated'
), combined AS (
  SELECT m.*,
         CASE
           WHEN min(m.temperature_score,m.humidity_score,m.plant_light_score) <= 0
             THEN 0.0
           ELSE 100.0
             * pow(m.temperature_score/100.0,
                   m.temperature_exponent/m.exponent_sum)
             * pow(m.humidity_score/100.0,
                   m.humidity_exponent/m.exponent_sum)
             * pow(m.plant_light_score/100.0,
                   m.plant_light_exponent/m.exponent_sum)
         END AS overall_score_raw
  FROM modeled AS m
)
SELECT environment_observation_id,
       context_id,
       zone_id,
       crop,
       profile_id,
       profile_version,
       captured_at_utc,
       air_temperature_c,
       relative_humidity_pct,
       ppfd_umol_m2_s,
       reference_photoperiod_h,
       temperature_score,
       humidity_score,
       plant_light_score,
       model_id,
       aggregation_family,
       temperature_exponent,
       humidity_exponent,
       plant_light_exponent,
       curve_family,
       round(overall_score_raw,1) AS overall_score,
       CASE
         WHEN overall_score_raw >= 80 THEN 'GOOD'
         WHEN overall_score_raw >= 60 THEN 'NORMAL'
         ELSE 'BAD'
       END AS score_grade,
       temperature_evidence_grade,
       humidity_evidence_grade,
       plant_light_evidence_grade
FROM combined;

CREATE VIEW latest_crop_environment_score AS
SELECT s.*
FROM crop_environment_score AS s
WHERE s.captured_at_utc = (
  SELECT max(s2.captured_at_utc)
  FROM crop_environment_score AS s2
  WHERE s2.context_id=s.context_id
);

COMMIT;
