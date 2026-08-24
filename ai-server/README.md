# AI 서버 — 관수량 추천

관수가 **필요한지**는 결정하지 않는다. 룰 엔진이 "필요하다"고 판단한 뒤 **얼마나** 줄지만 제안하며,
최종 승인·클램프·거부는 백엔드의 `IrrigationGovernor`가 한다.

계약 전문: [`docs/design/ml_irrigation_contract.md`](../docs/design/ml_irrigation_contract.md)
안전 설계: [`docs/design/edge_ai_hardening.md`](../docs/design/edge_ai_hardening.md) §3.2–3.3

> ⚠️ **현재 모델은 합성 데이터로 학습됐다.** 라벨이 물수지 수식이므로 평가 점수는 그 수식의 복원 정확도이며,
> 모델 성능이 아니다. 발표에는 "파이프라인 검증 완료, 실측 데이터 확보는 진행 중"으로 쓸 것.

## 빠른 실행

```bash
# 개발 스택에 포함되어 있다
make up-d
curl localhost:8000/health
```

```bash
# 컨테이너 안에서 테스트·재학습
make ai-test
make ai-train
```

## 호출 예시

```bash
curl -X POST localhost:8000/predict/irrigation \
  -H 'content-type: application/json' -d '{
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
  }'
```

```json
{"volume_ml":260,"confidence":0.9246,"model_version":"irrigation-reg-v1",
 "input_schema_version":1,"imputed":[],"latency_ms":31.8}
```

필수는 `soil_moisture_pct`·`air_temperature_c`·`air_humidity_pct` 셋뿐이다. 나머지는 생략하면 대치되고
`imputed`에 이름이 실린다. 범위를 벗어나면 422, 모델이 없으면 503이며 **500은 반환하지 않는다.**

## 구조

```
terrabyte_ai/
  features.py       피처 순서·범위·기본값. 학습과 추론이 함께 import한다
  water_balance.py  증발산 모델과 라벨 공식 (엣지 RF에서 이식)
  dataset.py        화분 단위 시뮬레이션. 세션 ID로 그룹 분할을 가능하게 한다
  predictor.py      아티팩트 로드, 예측, 신뢰도 산출
app/                FastAPI 앱
tools/              학습·데이터 생성 CLI
models/             학습된 아티팩트 (커밋 대상)
```

`features.py`를 학습과 추론이 함께 import하는 것이 train/serve skew를 막는 유일한 장치다.
학습 스크립트는 매번 끝에 두 경로의 예측이 일치하는지 검증한다.

## 로컬 개발 (컨테이너 없이)

Python 3.12를 쓴다. 3.14는 numpy·scikit-learn 휠 문제로 부적합하다.

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-train.txt
.venv/bin/python -m pytest tests -q
.venv/bin/python tools/train_irrigation_regressor.py --samples 40000 --seed 42
```

## 데이터

**CSV는 커밋하지 않는다** (D25). 생성기와 시드만 커밋하고 데이터셋은 재현으로 얻는다.
같은 `--samples`·`--seed`는 항상 같은 데이터를 만든다.

들여다보고 싶으면:

```bash
.venv/bin/python tools/generate_dataset.py --samples 5000 --seed 42 --output data/sample.csv
```

`data/`는 `.gitignore`에 있다.

## 모델 교체·롤백

`AI_MODEL_PATH` 환경변수를 바꾸고 컨테이너를 재시작한다. **코드 변경은 없다.**
`/health`가 현재 로드된 `model_version`을 노출한다.

## 알아둘 것

- **Governor 클램프는 정상이다.** 마른 3 L 이상 화분은 200 mL를 넘는 값이 나오며(합성 데이터 기준 약 23 %)
  Governor가 200 mL로 깎는다. 소량 다회 관수를 전제한 설계이고, 남은 부족분은 다음 주기에 채워진다.
- **`confidence`는 확률이 아니다.** 랜덤 포레스트 트리들의 합의도이며, 학습 분포 밖 입력에는 0.3 상한이 걸린다.
- **`soil_temperature_c`는 envelope v2에서도 선택 필드다.** v2(PR #78) 병합 전까지는 항상 대치값이 들어가고,
  병합 후에도 토양 프로브가 없는 노드에서는 계속 결측이다. 대치 경로는 임시방편이 아니라 상시 동작하는 경로다.
- **`pot` 테이블에 용적 컬럼이 없다.** 호출자가 `substrate_volume_ml`을 직접 넣어야 한다.
