# 관수량 AI 데이터 계약

최종 갱신: 2026-08-16 (Asia/Seoul)
대상 이슈: #54 (데이터·평가 기준), #55 (AI 서버)
관련 계획: `docs/todolist.md` P3-1, P3-2

> **우선순위**: 이 문서가 [`edge_ai_hardening.md`](edge_ai_hardening.md) §3.2–3.3과 충돌하면 **그 문서가 우선한다.**
> 여기서는 그 설계를 구현 가능한 수준까지 구체화할 뿐 새 결정을 만들지 않는다.

---

## 0. AI의 역할 (범위 선언)

```
룰 엔진      "물을 줘야 하는가"를 결정한다.        ← AI는 관여하지 않는다
AI 서버      "얼마나 줄까"를 제안한다.             ← 이 문서의 대상
Governor     승인·거부·클램프. 유일한 명령 발행자.  ← AI 출력을 검증한다
Arduino      물리적 최종 방어.
```

이 계약에서 반드시 지켜야 하는 세 가지:

1. **AI는 단독으로 관수를 유발할 수 없다.** 호출 자체가 룰 엔진의 "NEEDED" 판정 이후에만 일어난다.
2. **AI 서버는 자기 출력을 클램프하지 않는다.** 범위를 벗어난 값은 그대로 반환하고, 백엔드가 **클램프가 아니라 폴백**한다 (D15).
   `99999`를 `200`으로 깎아 내보내면 "모델이 고장났는데 그럴듯한 값이 나가는" 상태가 된다.
3. **AI 서버가 죽어도 시스템은 동작해야 한다.** 백엔드는 타임아웃 800 ms 후 화분 용적 기반 고정량 표로 폴백한다.

---

## 1. 입력 피처 (`input_schema_version: 1`)

엣지 Random Forest(`edge/pi/terrabyte_edge/irrigation/features.py`)의 6개 피처를 그대로 상속하고
화분 맥락 2개를 더한다. **필드명은 백엔드 `MeasurementMetric` enum 값과 문자 그대로 일치시킨다.**

| 피처 | 단위 | 허용 범위 | 결측 시 동작 | 출처 |
|---|---|---|---|---|
| `soil_moisture_pct` | % | 0 – 100 | **422 거부** | Influx `telemetry_sample` |
| `soil_temperature_c` | ℃ | −20 – 80 | `20.0` 대치 + `imputed[]` 기록 | Influx (envelope v2에서 추가, **선택 필드**) |
| `air_temperature_c` | ℃ | −50 – 100 | **422 거부** | Influx |
| `air_humidity_pct` | % | 0 – 100 | **422 거부** | Influx |
| `plant_light_ppfd_umol_m2_s` | μmol/m²/s | 0 – 5000 | `0.0` 대치(야간 간주) + 기록 | Influx |
| `hours_since_last_irrigation` | h | 0 – 336 | `72.0` 대치 + 기록 | `device_command` 최신 성공 건 |
| `substrate_volume_ml` | mL | 100 – 20000 | `1000` 대치 + 기록 | `pot` (**컬럼 미존재 — §6 참조**) |
| `crop_code` | — | `crop.code` 8종 | `"unknown"` 대치 | `pot.crop_code` |

`crop_code` 허용값 (`V6__create_crop_and_add_device_crop.sql`):
`cherry_tomato`, `lettuce`, `basil`, `peppermint`, `welsh_onion`, `arugula`, `wasabi`, `coriander`.
학습에 없던 코드가 와도 **거부하지 않고** 예측한다 — 작물이 추가될 때 AI 서버가 장애 지점이 되면 안 된다.
대신 `unknown`으로 취급되어 `confidence`가 낮아진다.

### 1.1. AI가 **보지 않는** 것

| 값 | 이유 |
|---|---|
| `observed_at` 신선도(10분) | Governor 게이트 1의 책임 |
| `soil_sensor_valid` 등 유효성 플래그 | Governor 게이트 2의 책임 |
| 직전 관수량, 일일 누적량 | Governor 게이트 5·6의 책임 |
| 사용자 수동 조작 이력 | 관수량 결정과 무관 |

신선도·유효성 검사를 AI에 넣으면 **같은 규칙이 두 곳에 존재**하게 되고, 두 벌의 규칙은 반드시 어긋난다(D16과 같은 논리).
AI는 "지금 이 상태의 화분에 몇 mL가 필요한가"라는 순수 함수여야 한다.

### 1.2. 시계열 윈도우를 쓰지 않는 이유

v1은 **최신 샘플 1건**만 쓴다. 백엔드는 `MeasurementStore.findLatest(potId)` 한 번으로 피처를 조달한다.
`hours_since_last_irrigation`이 "최근 이력"의 역할을 대신하고, 이보다 긴 윈도우를 넣으면
Influx 집계 쿼리가 800 ms 예산을 잡아먹는다. 실측 데이터가 쌓이면 v2에서 재검토한다.

> `findLatest`가 현재 `range(start: 1970-01-01)`이라 **아무리 오래된 값도 반환한다**(설계 문서의 V3).
> 이 구멍은 #48에서 `findLatestWithin(potId, Duration)` 추가로 닫는다. AI 서버는 이 문제를 알지 못해도 된다.

---

## 2. REST 계약

### 2.1. `POST /predict/irrigation`

요청 (snake_case — 백엔드 `@JsonNaming(SnakeCaseStrategy)`와 일치):

```json
{
  "input_schema_version": 1,
  "pot_id": 42,
  "crop_code": "cherry_tomato",
  "substrate_volume_ml": 3000,
  "soil_moisture_pct": 18.0,
  "soil_temperature_c": 21.5,
  "air_temperature_c": 27.0,
  "air_humidity_pct": 45.0,
  "plant_light_ppfd_umol_m2_s": 520.0,
  "hours_since_last_irrigation": 30.0
}
```

`pot_id`는 **로그 상관용이며 예측에 쓰이지 않는다.** 생략 가능.

응답 200:

```json
{
  "volume_ml": 118,
  "confidence": 0.78,
  "model_version": "irrigation-reg-v1",
  "input_schema_version": 1,
  "imputed": ["soil_temperature_c"],
  "latency_ms": 4.1
}
```

| 필드 | 타입 | 의미 |
|---|---|---|
| `volume_ml` | int | 권장 관수량. **클램프되지 않은 원본 예측** |
| `confidence` | float 0–1 | §3 참조 |
| `model_version` | string | `irrigation_decision.ai_model_version`에 그대로 기록된다 |
| `input_schema_version` | int | 백엔드 기대값과 다르면 백엔드가 폴백 |
| `imputed` | string[] | 대치된 피처 이름. 비어 있으면 전 피처가 실측 |
| `latency_ms` | float | 서버 내부 처리 시간 (네트워크 제외) |

오류 응답:

| 코드 | 상황 | 본문 |
|---|---|---|
| 422 | 필수 피처 누락 / 범위 이탈 / `input_schema_version` 불일치 | `{"code": "INVALID_FEATURES", "message": "...", "details": [...]}` |
| 503 | 모델 아티팩트 미로드 | `{"code": "MODEL_UNAVAILABLE", "message": "..."}` |

**500을 반환하지 않는다.** 예측이 불가능한 모든 상황은 422(입력 문제) 또는 503(서버 문제)으로 명확히 구분되어야
백엔드 메트릭 `ai_predict{outcome=...}`이 의미를 가진다.

### 2.2. `GET /health`

```json
{
  "status": "ok",
  "model_version": "irrigation-reg-v1",
  "input_schema_version": 1,
  "loaded_at": "2026-08-16T04:12:33Z",
  "last_latency_ms": 4.1
}
```

모델 미로드 시 **503** + `{"status": "degraded", "model_version": null, ...}`.
컨테이너를 살려두고 503을 내는 이유는, 백엔드가 "AI 없음"을 정상 폴백 경로로 처리하도록 설계됐기 때문이다.
`docker-compose`에서 `backend`의 `depends_on`은 반드시 `service_started`여야 한다 — `service_healthy`로 걸면
AI가 죽었을 때 백엔드까지 못 뜬다.

### 2.3. 인증

기본은 **무인증**이다. AI 서버는 compose 내부 네트워크에만 노출되며 프로덕션에서는 호스트 포트를 열지 않는다.
`AI_API_KEY` 환경변수가 설정된 경우에만 `X-Api-Key` 헤더 검증이 활성화된다(비교는 상수 시간).

### 2.4. 백엔드 측 계약 (참고 — 구현은 #48 이후 별도 PR)

```
타임아웃           800 ms (재시도 없음 — 재시도하면 예산을 두 배로 쓴다)
schema 불일치      → fallbackVolume(pot),  metric outcome=schema_mismatch
volume_ml ∉ [0,500] → fallbackVolume(pot), metric outcome=out_of_range   ※ 클램프 아님
confidence < 0.5   → min(volume_ml, fallbackVolume(pot))
예외·타임아웃      → fallbackVolume(pot),  metric outcome=error|timeout
```

폴백 표 (`edge_ai_hardening.md` §3.2):

| 화분 용적 | 기본 관수량 |
|---|---|
| ~1 L | 40 mL |
| 1–3 L | 80 mL |
| 3–6 L | 120 mL |
| 6 L~ | 160 mL |

이 반환값조차 Governor 게이트 7(`[20, 200] mL` 클램프)을 다시 통과한다. 이중 검증이다.

> **클램프는 예외가 아니라 정상 동작이다.** 물수지상 3 L 이상 화분이 많이 마르면 200 mL를 넘는 값이 나온다
> (합성 데이터 기준 약 23 %). 예: 3 L 방울토마토 화분, 토양수분 18 % → 260 mL 제안 → Governor가 200 mL로 클램프.
> 이는 설계 의도대로 동작하는 것이다 — Governor의 1회 200 mL·일일 600 mL는 **소량 다회 관수**를 전제하며,
> 남은 부족분은 다음 주기에 채워진다. 모델 출력을 200 mL에 맞춰 깎지 않는 이유는,
> "이 화분은 물이 많이 필요하다"는 정보 자체가 운영자와 사후 분석에 필요하기 때문이다.
> `clamp_reason=MAX_DOSE`가 자주 찍히는 것은 정상이며, 이 비율이 낮아지려면 관수 주기를 짧게 가져가야 한다.

---

## 3. `confidence`의 정의

RandomForest 개별 트리 예측의 산포에서 만든다:

```
mean       = 트리 예측 평균 (= volume_ml)
std        = 트리 예측 표준편차
confidence = clip(1 - std / max(mean, 1), 0, 1)
```

트리들이 일치하면 1에 가깝고, 갈리면 0에 가깝다.
추가로 **입력이 학습 분포 밖이면**(피처별 학습 min/max 밖) `confidence`에 0.3 상한을 씌운다.
`crop_code`가 학습에 없던 값일 때도 같은 상한이 적용된다.

이 값은 통계적 신뢰구간이 아니라 **앙상블 합의도**다. 문서와 코드 주석에 그렇게 적어 오해를 막는다.

---

## 4. 학습 데이터 (P3-2)

### 4.1. 출처: 물수지 기반 합성 데이터

실측 데이터를 확보할 수 없으므로 합성 데이터로 시작한다.
`edge/pi/tools/train_irrigation_rf.py`의 증발산 모델을 **그대로 이식**해
엣지와 서버가 같은 물리 가정을 공유하게 한다 (엣지가 억제하는 상황과 서버가 제안하는 양이 모순되지 않도록).

```
target_pct   = 작물별 목표 수분 (기본 35 %, 작물별 ±5)
holding      = 0.45                       # 배지 보수력 (용적 대비 최대 함수량 비율)
efficiency   = 0.85                       # 배수·표면 유출 손실

redistribute = 1.4 * exp(-hours_since / 3)          # 방금 준 물이 아직 퍼지는 중
effective    = soil_moisture_pct + redistribute
deficit_ml   = max(0, target_pct - effective)/100 * substrate_volume_ml * holding
lookahead_ml = ET(%/h) * 12 h / 100 * substrate_volume_ml * holding * 0.5
volume_ml    = (deficit_ml + lookahead_ml) / efficiency * N(1, 0.10)
volume_ml    = clip(volume_ml, 0, 500)
```

`N(1, 0.10)` 잡음은 필수다. 없으면 모델이 결정론적 경계를 통째로 암기해 평가 점수가 무의미해진다.

### 4.2. ⚠️ 합성 데이터 점수를 모델 성능으로 인용하지 말 것

합성 라벨은 수식으로 정답을 만들어낸 것이므로, 모델이 하는 일은 사실상 **그 수식을 되찾는 것**이다.
문제를 낸 사람이 답까지 정해준 셈이라 점수가 높게 나오는 것이 당연하며, **식물에 대해서는 아무것도 말해주지 않는다.**

발표·보고서에서는 **"파이프라인 검증 완료, 실측 데이터 확보는 진행 중"**으로 표현한다.
이 경고 문구는 학습 스크립트 stdout 배너에도 동일하게 출력한다.

### 4.3. 저장 정책

**CSV를 저장소에 커밋하지 않는다.** 생성기 코드와 시드만 커밋하고 데이터셋은 재현으로 얻는다.

> 엣지 RF에서 학습 도구는 `feature/edge-rf-fallback`에, 데이터 CSV 20 MB는 `feature/mqtt-transport`에 흩어져
> 어느 한쪽만으로는 학습이 안 되는 문제가 있었다. 생성기를 커밋하면 이 문제가 구조적으로 사라진다.

재현 명령: `python tools/train_irrigation_regressor.py --samples 40000 --seed 42`

### 4.4. 실측 데이터 전환 조건

| 항목 | 최소 기준 |
|---|---|
| 화분 수 | 5개 이상 (용적·작물이 서로 다를 것) |
| 관측 기간 | 3주 이상 |
| 관수 이벤트 | 200건 이상, 실제 주입량(`device_command.actual_ml`) 기록 포함 |

라벨은 공식이 아니라 **운영자가 실제로 준 양**이 된다. 이 시점에 §4.1 공식은 폐기하고 재학습한다.
관련: 실측 데이터 수집 #67.

---

## 5. 평가 기준

| 지표 | 정의 | 용도 |
|---|---|---|
| **MAE (mL)** | 평균 절대 오차 | 1차 지표 |
| RMSE (mL) | 제곱근 평균 제곱 오차 | 큰 오차 민감도 |
| R² | 결정계수 | 참고 |
| **과다 예측률** | `P(pred > true × 1.5)` | **안전 지표** |

관수에서 과다와 과소는 비용이 다르다. 과소는 다음 주기에 만회되지만 과다는 되돌릴 수 없다.
따라서 MAE가 같아도 **과다 예측률이 낮은 모델을 채택한다.**

**분할**: 합성 화분 세션 ID 기준 `GroupShuffleSplit` 70 / 15 / 15.
행 단위 무작위 분할은 같은 세션의 이웃 샘플이 학습·검증에 나뉘어 들어가 누수가 된다.

**외삽 슬라이스**: 학습에 포함하지 않은 화분 용적 구간(예: 6 L 이상) 하나를 홀드아웃해 별도 보고한다.
실제 배포에서는 학습 때 못 본 크기의 화분이 반드시 들어온다.

---

## 6. 알려진 결손 (이 문서로 해결되지 않는 것)

| # | 내용 | 해소 시점 |
|---|---|---|
| G1 | **`soil_temperature_c`는 envelope v2에서도 선택 필드다.** #78 병합으로 `MeasurementMetric.SOIL_TEMPERATURE_C`와 −20~80 검증이 들어왔고 범위는 이 계약과 일치한다. 다만 토양 프로브가 없는 노드에서는 계속 결측이므로 **대치 경로는 임시방편이 아니라 상시 동작하는 경로다** | 부분 해소 (수집 경로는 열렸고, 결측은 상시) |
| G1b | **envelope v2에서 `soil_moisture_pct`가 nullable이 됐다.** 값이 없으면 관수량을 계산할 근거가 없으므로 **백엔드가 AI를 호출하지 말고 폴백해야 한다.** AI 서버는 이 경우 422로 거부한다 | 백엔드 연동 PR |
| G2 | **`pot` 테이블에 용적 컬럼이 없다.** 그전까지 호출자가 `substrate_volume_ml`을 직접 넣어야 하며, 폴백 표도 적용할 수 없다 | 백엔드 연동 PR |
| G3 | `crop_score_profile`에 **목표 토양수분이 없다** (온도·습도·PPFD만 있음). AI 서버가 자체 작물별 목표 수분표를 들고 있다 — 언젠가 한쪽으로 합쳐야 한다 | 미정 |
| G4 | 배지 보수력 0.45, 관수 효율 0.85, 목표 수분 35 %는 문헌 기반 가정이다. 펌프 정격 유량과 실제 배지가 확정되면 재보정 → **라벨 공식이 바뀌므로 재학습 필요** | 하드웨어 확정 시 |
| G5 | 유량계가 없어 실제 관수량은 `flow_ml_per_s × runtime_ms` 추정치다. 실측 라벨의 정확도 상한이 여기서 정해진다 | 유량계 도입 시 |

---

## 7. 모델 아티팩트 규약

- 파일명 `irrigation_reg_v{n}.joblib`
- 전처리는 sklearn `Pipeline`에 **동봉**한다 (train/serve skew 차단)
- 학습·추론이 **같은 `terrabyte_ai.features` 모듈**을 import한다
- 아티팩트에 함께 저장: `model_version`, `input_schema_version`, `feature_names`,
  `train_feature_ranges`(분포 밖 판정용), `trained_at`, `dataset_seed`, `metrics`
- `/health`가 로드된 버전을 노출한다
- **롤백 = `AI_MODEL_PATH` 환경변수 변경 + 컨테이너 재시작.** 코드 변경 없음
- 모든 `irrigation_decision` 행에 `ai_model_version`을 기록해 사후 귀책을 추적한다
