# Council v2 — 최종 종합 (SQLite 스키마 구성)

- 모더레이터: Claude Fable 5
- 작성일: 2026-07-15
- Round 1: 10 에이전트 (codex 5 × `gpt-5.6-sol` xhigh, agy 5 × `Claude Opus 4.6 (Thinking)`)
- Round 2: 3 에이전트 타깃 후속 (CLAUDE.md Level 3) — BH1750 하드웨어 확정 반영
- 근거: `backend/docs/newcropinfo/` 3개 문서 (검증 13 레코드, 격리 17 후보)

---

## 요약

10명 전원이 **작물별 생육환경 점수(0–100 또는 정상/주의/위험)는 현재 근거로 만들 수 없다**고 판정했다.
`can_a_numeric_score_exist`: **8명 `no`, 2명 `yes_with_severe_limits`**. 그리고 `yes_with_severe_limits`
2명(agy-procurement, agy-product-advocate)조차 "축별 distance-to-anchor 지표만 가능, **복합 점수는 절대 불가**"라고
명시했다. 즉 복합 점수에 대해서는 **10/10 반대**이며, 이견은 "축별 지표를 지표라 부를 것인가"에만 있다.

그 위에 Round 2가 두 번째 결론을 추가했다. **BH1750은 lux 센서이고, 재배 공간에 자연광이 유입된다.**
Round 2 3명 전원이 `conversion_exception_reachable: only_if`로 일치했고, 그 `only_if`의 전제는
**"밀폐 + 고정 스펙트럼 인공광"**이다. 사용자가 자연광 유입을 확정했으므로 그 전제는 깨진다.
따라서 **광 축(plant_light)의 작물 평가는 이 부지에서 blocked**다.

이것은 스키마 실패가 아니라 스키마가 정직하게 표현해야 할 **상태**다. 소음 축이 이미
`blocked_until_site_zoning_is_known`으로 같은 패턴을 쓰고 있다.

---

## 후보 옵션

| Option | 핵심 | 장점 | 위험 | 비용 | 되돌리기 | 지지 |
|---|---|---|---|---|---|---|
| O1 | SQLite 없이 JSON 3개를 그대로 데이터 레이어로 | 마이그레이션 0, 근거가 canonical | 라이브 텔레메트리 조인면 없음; 사용자가 이미 SQLite 결정 | 낮음 | 쉬움 | G |
| **O2** | **SQLite는 운영 조인 레이어로만. 근거 문서는 원문 그대로 blob + 타입별 투영** | **claim_role·prohibited_use 보존, 텔레메트리 조인 가능, 정책 변경이 UPDATE 한 줄** | 투영이 blob과 drift 가능 | 중간 | 보통 | A B C D E |
| O3 | 작물×축 정상범위 min/max + 복합 0–100 점수 | 원 요청에 문자 그대로 부합, UI 단순 | **측정된 적 없는 반응곡면 날조. 13개 레코드 전부의 prohibited_use 위반** | 중간 | 어려움 | **0명** |
| O4 | 시험 격자 자체를 저장·표시 (trial-position) | 미측정 구간을 등급으로 오독시키지 않음 | 공간적 근접을 암묵적 등급으로 읽을 위험 | 중간 | 보통 | C F H |
| O5 | claim-typed 4패널 (생육근거/병해조건/사람건강/법정소음), 절대 합성 않음 | 생육+건강+법률 범주오류 차단 | 숫자 하나를 원하는 운영자 기대와 충돌 | 중간 | 보통 | B D E J |

**O3를 지지한 에이전트는 10명 중 0명이다.** 이것이 이번 토론의 가장 중요한 단일 사실이다.

---

## 핵심 이견

1. **O1 vs O2 (SQLite 자체)** — agy-skeptic만 "SQLite는 조기 최적화, JSON이 곧 데이터 레이어"라고
   단독 반대했다. 나머지는 SQLite를 인정하되 **근거를 재모델링하지 않는 조건**을 달았다.
   사용자가 SQLite를 이미 결정했으므로 O2가 남는다. 단 skeptic의 지적은 O2 안에 흡수된다:
   근거 문서는 **불변 blob으로 보존**되고 SQLite는 그 위의 조인·운영 레이어일 뿐이다.

2. **O4 vs O5 (표현 방식)** — 상호 배타가 아니다. O5가 의미론(무엇을 주장하는가), O4가 렌더링
   (어떻게 보여주는가)이다. 통합 가능하며 통합해야 한다.

3. **agy-procurement의 Round 1 → Round 2 자기수정** — Round 1에서 "lux 센서는 복구 불가능한 오류,
   $3 lux 센서가 축을 죽인다"고 했으나, Round 2에서 스스로 수정했다: *"내 Round 1 표현은 방향은
   맞았지만 한 가지에서 과했다. 계약 자체가 좁은 conversion_exception을 제공하므로 LED 전용
   조건에서는 축을 구제할 수 있다. 다만 **자연광이 드는 도심 유휴공간 — 더 유력한 배치 —
   에서는 '복구 불가능'이 정확히 맞다.**"* 사용자가 자연광을 확정했으므로 이 단서가 발동한다.

---

## 결정의 급소 (decision crux)

> 점수를 만들 수 있느냐가 아니라, **점수가 없다는 사실을 스키마가 정직하게 들고 있을 수 있느냐**다.

근거가 없는 칸에 0점이나 "주의"를 넣는 순간 제품은 거짓말을 시작한다. 8개 작물 중 3개
(방울토마토·대파·아루굴라)는 작물 축 근거가 **전무**하고, **어느 작물도 생육 최적 RH 근거가 없다**.
결측은 절대 0이 아니다 (`Missing evidence is never zero` — codex-score-semantics).

---

## 권고

**O2 (조인 레이어 SQLite) + O5 (claim-typed 평가) + O4 (시험 격자 렌더링)** 를 하나로 채택한다.

### 1. 근거 레이어는 불변

세 JSON 문서를 바이트 그대로 `evidence_document`에 적재하고, UPDATE/DELETE를 트리거로 금지한다.
SQLite는 근거의 **사본**이지 출처가 아니다. 근거 수정은 JSON 파일 수정 후 재적재로만 이뤄진다.

### 2. 제네릭 `value` / `unit` 컬럼을 만들지 않는다

이번 토론에서 나온 가장 강력한 구조적 발견이다 (codex-schema-lux). 단위별로 **타입이 분리된 투영
테이블**을 만든다: `corpus_ppfd_reference`(µmol m⁻² s⁻¹), `corpus_dli_reference`(mol m⁻² day⁻¹),
`corpus_temperature_reference`(°C) …

그러면 raw lux와 코퍼스 PPFD를 비교하는 쿼리는 **조인할 컬럼이 존재하지 않아서** 실패한다.
정책으로 막는 게 아니라 물리적으로 불가능해진다. `raw_lux_observation`에는
`raw_value`도 `unit`도 `ppfd`도 없고 오직 `lux_value_lx`만 있다.

### 3. lux→PPFD 경로는 합성 FK로 봉인

```sql
light_regime.fixed_spectrum_eligible  -- GENERATED: spectrum_mode='fixed_artificial' AND daylight_excluded=1
lux_ppfd_validation.required_regime_eligibility  -- CHECK (= 1)
FOREIGN KEY (regime_id, required_regime_eligibility)
  REFERENCES light_regime(regime_id, fixed_spectrum_eligible)
```

자연광이 드는 zone은 `fixed_spectrum_eligible = 0`이므로 **교정 행 자체를 INSERT할 수 없다.**
교정이 없으면 `derived_ppfd`가 없고, `derived_ppfd`가 없으면 작물 광 평가가 없다.
DB가 스스로 거짓말을 거부한다.

### 4. 축 상태를 1급 시민으로

```
evaluable | blocked_missing_context | blocked_measurement_basis
| context_mismatch | insufficient_window | no_verified_evidence
```

현재 부지 기준 실제 상태:

| 축 | 상태 | 사유 |
|---|---|---|
| air_temperature | evaluable (3작물: 바질·와사비유묘·상추) | 격자 앵커만. 정상범위 아님 |
| relative_humidity | **no_verified_evidence** (생육) / 바질 병해조건만 | 어느 작물도 생육 최적 RH 근거 없음 |
| plant_light | **blocked_measurement_basis** | BH1750 = lux, 자연광 혼합 → 변환 예외 도달 불가. 차광 구간 + 양자센서 교정 시 그 구간만 해제 가능 |
| particulate_matter | evaluable (사람 건강, 작물 아님) | WHO/한국 예보/2h 경보 3개 시간기준 분리 |
| noise | **blocked_missing_context** | 용도지역·도로변 미확정 |

5축 중 **작물 점수에 실제로 기여 가능한 축은 온도 하나**이며, 그것도 8작물 중 3작물에 대해
"이 시험의 격자에서 최고 처리점" 수준이다.

### 5. 점수 대신 나가는 것

- 축별 **distance-to-anchor** + 시험 격자 렌더링 (바질 온도: `11 | 17 | 23 | [29 최고처리] | 35`)
- `prohibited_use`를 UI에 **보이는 캡션으로** 노출
- 바질 광 500은 `objective = biomass_and_energy_efficiency`로 라벨 — 생물학적 최적이 아니라 **전기요금 최적**
- 와사비 140 위는 `above_tested_range_unknown` — 나쁜 게 아니라 **모르는** 것
- 근거 없는 3작물은 마커 없는 스파크라인 + "검증된 기준 없음"

---

## 보광 모듈 추가에 대하여 (사용자 추가 정보, 2026-07-15)

사용자가 "자연광이 모자랄 경우 추가 조명 모듈 구입 옵션이 있다"고 알려왔다.
**이것만으로는 광 축이 풀리지 않는다.** 직관과 반대되므로 명시해 둔다.

변환 예외의 전제는 두 개이며 **AND**로 묶여 있다:

```
fixed_spectrum_eligible = (spectrum_mode = 'fixed_artificial') AND (daylight_excluded = 1)
```

자연광이 드는 공간에 LED를 **더하면** `mixed_daylight_artificial`이 되고 `daylight_excluded = 0`이
유지된다. 즉 `fixed_spectrum_eligible = 0` → 교정 행 INSERT 불가 → 여전히 blocked.
문제는 빛의 **부족**이 아니라 스펙트럼의 **혼합**이며, 보광은 혼합을 악화시킬 뿐이다.
햇빛 비율이 시각·계절·날씨마다 변하므로 lux당 PPFD 계수가 시시각각 달라진다.

축을 푸는 것은 **빛을 더하는 행위가 아니라 자연광을 배제하는 행위**다.

### 실제로 열리는 경로: 구간(interval) 기반 차광

codex-schema-lux가 Round 2에서 이미 정확히 짚었다 — 평가는
*"fixed-spectrum, **daylight-excluded intervals**"* 에 한해 활성화된다. zone 단위가 아니라 **구간 단위**다.
그래서 `raw_lux_observation`이 `regime_id`를 들고 있다.

따라서 **차광 커튼 + 보광 LED** 조합이면 한 zone에 두 개의 regime이 공존한다:

| regime | spectrum_mode | daylight_excluded | fixed_spectrum_eligible | 광 축 |
|---|---|---|---|---|
| 주간 개방 | `mixed_daylight_artificial` | 0 | 0 | blocked |
| 차광 + LED 전용 | `fixed_artificial` | 1 | 1 | 교정 후 evaluable |

이 경우 차광 구간의 관측만 `derived_ppfd`를 얻는다. 보광 모듈은 **차광과 짝지어질 때만** 가치가 있다.

### 단, DLI는 여전히 죽는다

codex-curve-lux: *"DLI requires a wholly valid integration window."*
DLI는 하루 전체의 광량 적분이다. 하루 중 일부라도 혼합 자연광 구간이면 그날의 DLI는 무효다.
따라서 **상추 DLI 11.5 레코드는 24시간 완전 차광이 아닌 한 사용할 수 없다.**
PPFD 앵커(바질 500·페퍼민트 150–200·와사비 140·고수 200)는 차광 구간 내 순간값이므로 구제 가능하다.

### 결론

보광 모듈 구매는 **작물 재배에는 유익**하지만 **측정 정당성에는 무관**하다.
광 축 평가를 원한다면 구매 순서는:

1. 차광 수단 (자연광 배제) — 이것이 없으면 나머지가 무의미
2. 보광 LED (고정 스펙트럼, 모델·스펙트럼 기록)
3. 1시간 양자센서 대여 → 교정계수 검증 → `lux_ppfd_validation` 행 생성

3번 없이 1·2번만 하면 여전히 blocked다. BH1750은 그 계수 없이는 물리량이 아니라 상대값이다.

---

## 먼저 검증할 것 (1시간 이내)

codex-schema-lux의 negative-path 스모크 테스트를 그대로 채택한다:

> 인메모리 SQLite에 DDL을 적재하고, `spectrum_mode='mixed_daylight_artificial'`인 zone을 선언한 뒤,
> **교정 행 INSERT가 FK 위반으로 실패하는지**, 그리고 그 zone의 raw lux에서 PPFD/DLI 지표 행이
> 생성 불가능한지를 assert한다.

이 테스트가 통과하면 스키마가 사용자의 실제 부지에서 거짓말할 수 없음이 증명된다.

---

## 아직 하지 말 것

- 점수 함수·가중치·정상/주의/위험 경계 (근거 없음, README 판정원칙 7)
- lux→PPFD 고정계수 변환 — 자연광 혼합 구간에서는 불가. 차광 구간을 만들고 양자센서로
  계수를 검증한 뒤에야 그 구간에 한해 가능 (위 "보광 모듈" 절 참조)
- 상추 DLI 11.5 사용 — 24시간 완전 차광 전까지 무효
- 방울토마토·대파·아루굴라의 작물 축 행 (근거 0)
- 생육 최적 RH 행 (어느 작물도 없음)
- 소음 기준 행 선택 (용도지역 미확정)

---

## 남은 불확실성

- 바질 병해 위험을 구현하려면 **군락 내부 RH + 잎 젖음 센서** 결정이 선행돼야 한다 (BH1750과 별개 문제)
- PM 간이측정기 성능인증 등급 요구수준 미정 (2026-04-01 고시 시행)
- 온도 격자 간격이 6 °C라 실제 최적점은 27–31 어디든 가능 (agy-domain-skeptic)
