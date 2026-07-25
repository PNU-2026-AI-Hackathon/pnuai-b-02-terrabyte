"""TerraByte 생육환경 점수 스키마 스모크 테스트.

전제: crop_environment_observation에는 완전히 보정되고 품질검사를 통과한
canonical 값(°C, RH %, PPFD)만 들어온다.

실행: python backend/db/smoke_test.py
"""

import pathlib
import sqlite3
import sys


SCHEMA = pathlib.Path(__file__).with_name("schema.sql")
passed: list[str] = []
failed: list[str] = []


def check(name, fn):
    try:
        fn()
        passed.append(name)
    except Exception as exc:  # 스모크 테스트는 다음 항목도 계속 실행한다.
        failed.append(f"{name}: {type(exc).__name__}: {exc}")


def fresh():
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA.read_text(encoding="utf-8"))
    db.execute("PRAGMA foreign_keys = ON")
    return db


def seed_context(db, *, crop="basil", profile_id="basil-general-v1", context_id="ctx1"):
    db.execute("INSERT INTO site VALUES ('s1','테스트 재배지','Asia/Seoul',NULL,NULL)")
    db.execute("INSERT INTO zone VALUES ('z1','s1','indoor')")
    db.execute(
        "INSERT INTO crop_context "
        "(context_id,zone_id,crop,score_profile_id,cultivar,growth_stage,"
        "cultivation_system,photoperiod_h,valid_from_utc,valid_to_utc) "
        "VALUES (?,?,?,?,?,?,?,?,?,NULL)",
        (
            context_id,
            "z1",
            crop,
            profile_id,
            None,
            "general_vegetative",
            "controlled_environment",
            16,
            "2026-07-16T00:00:00Z",
        ),
    )
    db.commit()


def add_observation(db, *, captured_at, temperature, humidity, ppfd, context_id="ctx1"):
    cursor = db.execute(
        "INSERT INTO crop_environment_observation "
        "(context_id,captured_at_utc,air_temperature_c,relative_humidity_pct,ppfd_umol_m2_s) "
        "VALUES (?,?,?,?,?)",
        (context_id, captured_at, temperature, humidity, ppfd),
    )
    db.commit()
    return cursor.lastrowid


# 1. 스키마 자체와 점수 뷰가 유효한 SQLite인가
def t_schema_loads():
    db = fresh()
    tables = db.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table'"
    ).fetchone()[0]
    views = {
        row[0]
        for row in db.execute("SELECT name FROM sqlite_master WHERE type='view'")
    }
    assert tables > 25, f"expected >25 tables, got {tables}"
    assert {
        "crop_environment_axis_score",
        "crop_environment_score",
        "latest_crop_environment_score",
    } <= views


# 2. 8개 작물의 v1/v2 프로필과 활성 v2가 모두 적재되는가
def t_eight_profiles_seeded():
    db = fresh()
    profiles = db.execute("SELECT count(*) FROM crop_score_profile").fetchone()[0]
    active = db.execute("SELECT count(*) FROM crop_score_profile_activation").fetchone()[0]
    active_v2 = db.execute(
        "SELECT count(*) FROM crop_score_profile_activation WHERE profile_id LIKE '%-v2'"
    ).fetchone()[0]
    assert profiles == 16, profiles
    assert active == 8, active
    assert active_v2 == 8, active_v2


# 3. 모든 프로필은 현재 동일가중 기하평균 + 사다리꼴 모델에 결합된다
def t_equal_geometric_models_seeded():
    db = fresh()
    models = db.execute("SELECT count(*) FROM crop_score_model_config").fetchone()[0]
    active_models = db.execute(
        "SELECT count(*) FROM crop_score_profile_activation a "
        "JOIN crop_score_model_config m "
        "ON m.profile_id=a.profile_id AND m.crop_code=a.crop_code "
        "WHERE m.contract_version='score-v1' AND m.validation_status='validated' "
        "AND m.aggregation_family='equal_geometric_v1' "
        "AND m.temperature_exponent=1 AND m.humidity_exponent=1 "
        "AND m.plant_light_exponent=1 AND m.curve_family='trapezoid_v1'"
    ).fetchone()[0]
    assert models == 16, models
    assert active_models == 8, active_models


# 4. 모델 설정은 프로필과 함께 새 버전으로만 배포한다
def t_score_model_config_immutable():
    db = fresh()
    for stmt in (
        "UPDATE crop_score_model_config SET temperature_exponent=2 "
        "WHERE model_id='basil-general-v2-score-v1'",
        "DELETE FROM crop_score_model_config "
        "WHERE model_id='basil-general-v2-score-v1'",
    ):
        try:
            db.execute(stmt)
            raise AssertionError(f"점수 모델 설정이 변경됐다: {stmt}")
        except sqlite3.IntegrityError:
            pass


# 3. 프로필은 수정하지 않고 새 버전으로만 배포해야 한다
def t_score_profile_immutable():
    db = fresh()
    for stmt in (
        "UPDATE crop_score_profile SET temperature_weight=39 "
        "WHERE profile_id='basil-general-v1'",
        "DELETE FROM crop_score_profile WHERE profile_id='basil-general-v1'",
    ):
        try:
            db.execute(stmt)
            raise AssertionError(f"점수 프로필이 변경됐다: {stmt}")
        except sqlite3.IntegrityError:
            pass


# 4. 작물과 다른 프로필은 컨텍스트에 연결할 수 없다
def t_profile_crop_match_enforced():
    db = fresh()
    try:
        seed_context(db, crop="lettuce", profile_id="basil-general-v1")
        raise AssertionError("lettuce 컨텍스트가 basil 프로필을 참조했다")
    except sqlite3.IntegrityError:
        pass


# 5. 모든 값이 목표 구간이면 세 축과 종합이 100점이다
def t_context_scoring_identity_immutable():
    db = fresh()
    seed_context(db)
    try:
        db.execute(
            "UPDATE crop_context SET crop='peppermint', "
            "score_profile_id='peppermint-general-v1' WHERE context_id='ctx1'"
        )
        raise AssertionError("기존 컨텍스트의 작물·프로필 결합이 변경됐다")
    except sqlite3.IntegrityError:
        pass


# 6. 모든 값이 목표 구간이면 세 축과 종합이 100점이다
def t_optimal_basil_is_100():
    db = fresh()
    seed_context(db)
    add_observation(
        db,
        captured_at="2026-07-16T01:00:00Z",
        temperature=27,
        humidity=60,
        ppfd=400,
    )
    row = db.execute(
        "SELECT temperature_score,humidity_score,plant_light_score,overall_score,score_grade "
        "FROM crop_environment_score"
    ).fetchone()
    assert row == (100.0, 100.0, 100.0, 100.0, "GOOD"), row


# 7. 각 축의 상승 경사 중간값은 정확히 50점이다
def t_trapezoid_linear_ramp():
    db = fresh()
    seed_context(db)
    add_observation(
        db,
        captured_at="2026-07-16T01:00:00Z",
        temperature=19.5,  # basil 15→24의 정중앙
        humidity=40,      # 30→50의 정중앙
        ppfd=130,         # 0→260의 정중앙
    )
    row = db.execute(
        "SELECT temperature_score,humidity_score,plant_light_score,overall_score,score_grade "
        "FROM crop_environment_score"
    ).fetchone()
    assert row == (50.0, 50.0, 50.0, 50.0, "BAD"), row


# 8. 어느 한 축이 0점이면 가중 기하평균도 0점이다
def t_zero_axis_forces_zero_overall():
    db = fresh()
    seed_context(db)
    add_observation(
        db,
        captured_at="2026-07-16T01:00:00Z",
        temperature=15,
        humidity=60,
        ppfd=400,
    )
    row = db.execute(
        "SELECT temperature_score,overall_score,score_grade FROM crop_environment_score"
    ).fetchone()
    assert row == (0.0, 0.0, "BAD"), row


# 9. 현재 1/1/1 설정은 기존 1/3 기하평균과 동일하다
def t_equal_geometric_mean():
    db = fresh()
    seed_context(db)
    add_observation(
        db,
        captured_at="2026-07-16T01:00:00Z",
        temperature=27,
        humidity=40,
        ppfd=400,
    )
    row = db.execute(
        "SELECT temperature_score,humidity_score,plant_light_score,overall_score,score_grade "
        "FROM crop_environment_score"
    ).fetchone()
    assert row == (100.0, 50.0, 100.0, 79.4, "NORMAL"), row


# 10. latest 뷰는 컨텍스트별 최신 관측 하나만 반환한다
def t_latest_score_view():
    db = fresh()
    seed_context(db)
    first = add_observation(
        db,
        captured_at="2026-07-16T01:00:00Z",
        temperature=27,
        humidity=60,
        ppfd=400,
    )
    latest = add_observation(
        db,
        captured_at="2026-07-16T02:00:00Z",
        temperature=19.5,
        humidity=40,
        ppfd=130,
    )
    rows = db.execute(
        "SELECT environment_observation_id,overall_score FROM latest_crop_environment_score"
    ).fetchall()
    assert rows == [(latest, 50.0)], (first, latest, rows)


# 11. canonical 입력 경계가 범위 밖 값과 계약 위조를 거부한다
def t_perfect_input_contract_enforced():
    db = fresh()
    seed_context(db)
    statements = (
        (
            "INSERT INTO crop_environment_observation "
            "(context_id,captured_at_utc,air_temperature_c,relative_humidity_pct,ppfd_umol_m2_s) "
            "VALUES ('ctx1','2026-07-16T01:00:00Z',25,101,300)"
        ),
        (
            "INSERT INTO crop_environment_observation "
            "(context_id,captured_at_utc,air_temperature_c,relative_humidity_pct,ppfd_umol_m2_s) "
            "VALUES ('ctx1','2026-07-16T02:00:00Z',25,60,-1)"
        ),
        (
            "INSERT INTO crop_environment_observation VALUES "
            "(NULL,'ctx1','2026-07-16T03:00:00Z',25,60,300,'unverified')"
        ),
    )
    for stmt in statements:
        try:
            db.execute(stmt)
            raise AssertionError(f"유효하지 않은 canonical 입력이 저장됐다: {stmt}")
        except sqlite3.IntegrityError:
            pass


# 12. 컨텍스트 유효기간 밖의 관측을 거부한다
def t_context_window_enforced():
    db = fresh()
    seed_context(db)
    try:
        add_observation(
            db,
            captured_at="2026-07-15T23:59:59Z",
            temperature=27,
            humidity=60,
            ppfd=400,
        )
        raise AssertionError("컨텍스트 시작 전 관측이 저장됐다")
    except sqlite3.IntegrityError:
        pass


# 13. 근거 문서는 점수 정책 변경 후에도 불변이다
def t_evidence_immutable():
    db = fresh()
    db.execute(
        "INSERT INTO evidence_document VALUES ('verified_numeric_evidence','1.0.0',"
        "?, '{}', '2026-07-16T00:00:00Z')",
        ("a" * 64,),
    )
    db.commit()
    for stmt in (
        "UPDATE evidence_document SET schema_version='2' "
        "WHERE document_name='verified_numeric_evidence'",
        "DELETE FROM evidence_document WHERE document_name='verified_numeric_evidence'",
    ):
        try:
            db.execute(stmt)
            raise AssertionError(f"근거 문서가 변경됐다: {stmt}")
        except sqlite3.IntegrityError:
            pass


# 14. 대표 광 프로필의 PPFD 경계가 스펙값과 일치한다
def t_profile_reference_values():
    db = fresh()
    values = dict(
        db.execute(
            "SELECT crop_code,printf('%.1f/%.1f',ppfd_optimal_low_umol_m2_s,"
            "ppfd_optimal_high_umol_m2_s) FROM crop_score_profile p "
            "JOIN crop_score_profile_activation a USING (crop_code) "
            "WHERE p.profile_id=a.profile_id"
        ).fetchall()
    )
    assert values["lettuce"] == "200.0/295.0", values["lettuce"]
    assert values["cherry_tomato"] == "300.0/521.0", values["cherry_tomato"]
    assert values["peppermint"] == "150.0/200.0", values["peppermint"]
    assert values["wasabi"] == "90.0/140.0", values["wasabi"]


# 15. 활성 온도 프로필은 검증한 absolute/optimal 네 경계를 사용한다
def t_active_temperature_boundaries():
    db = fresh()
    values = {
        row[0]: row[1:]
        for row in db.execute(
            "SELECT p.crop_code,p.temperature_zero_low_c,p.temperature_optimal_low_c,"
            "p.temperature_optimal_high_c,p.temperature_zero_high_c "
            "FROM crop_score_profile p JOIN crop_score_profile_activation a "
            "ON a.crop_code=p.crop_code AND a.profile_id=p.profile_id"
        )
    }
    assert values["basil"] == (7.0, 18.0, 29.0, 36.0)
    assert values["peppermint"] == (4.0, 15.0, 25.0, 35.0)
    assert values["cherry_tomato"] == (7.0, 18.5, 26.5, 35.0)
    assert values["welsh_onion"] == (6.0, 12.0, 25.0, 30.0)
    assert values["arugula"] == (8.0, 15.0, 25.0, 29.0)
    assert values["wasabi"] == (5.0, 12.0, 18.0, 26.0)
    assert values["lettuce"] == (5.0, 12.0, 24.0, 30.0)
    assert values["coriander"] == (4.0, 15.0, 26.0, 32.0)


for name, fn in list(globals().items()):
    if name.startswith("t_"):
        check(name[2:], fn)

print(f"\n통과 {len(passed)} / 실패 {len(failed)}\n")
for item in passed:
    print(f"  PASS  {item}")
for item in failed:
    print(f"  FAIL  {item}")
sys.exit(1 if failed else 0)
