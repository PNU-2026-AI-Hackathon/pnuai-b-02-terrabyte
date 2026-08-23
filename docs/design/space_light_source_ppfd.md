# 공간 광원 기반 PPFD 환산 설계

작성일: 2026-08-23

관련 문서: [기기 모델과 텔레메트리 계약](device_model_and_telemetry_contract.md)

## 배경

TSL2591이 재는 것은 조도(lux)이고 PPFD는 거기서 유도한 추정치다. 두 값을 잇는
계수는 **광원의 분광 분포에 따라 달라진다** — 태양광과 형광등은 같은 lux에서도
식물이 쓸 수 있는 광자 수가 다르다.

현재 이 계수는 아두이노 펌웨어의 컴파일 상수 `TB_PPFD_PER_LUX`(0.0185, 태양광
기준)로 박혀 있다. 문제는 세 가지다.

1. **광원을 바꾸면 펌웨어를 다시 구워야 한다.** 조명은 사용자가 언제든 바꾸는
   것인데 환산 계수가 기기에 붙어 있다.
2. **계수가 `TelemetryConfig.local.h`에 있고 이 파일은 git-ignored다.** 노드마다
   다른 값이 들어가 있어도 서버는 알 수 없다.
3. **PPFD가 필수 필드라 환산이 실패하면 telemetry 전체가 보류된다.**
   2026-08-22에 이 결합 때문에 모든 측정이 멈춘 사례가 있다.

광원은 기기가 아니라 **공간의 속성**이다. 따라서 공간 등록 시 입력받고 서버가
환산하는 구조로 옮긴다.

## 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 환산 위치 | **백엔드** | 광원 변경에 재플래시가 필요 없고, 서버가 계수의 단일 출처가 된다 |
| 환산 시점 | **조회 시점** | 광원을 잘못 골랐다가 고치면 과거 그래프까지 소급 정정된다 |
| lux 전달 | **계약에 추가** | 백엔드가 lux를 받은 적이 없다. 역산은 펌웨어 상수에 대한 암묵적 의존을 만든다 |
| 선택지 | **3종 + 모름** | 근거 있는 계수가 있는 광원만 노출한다 |
| 미설정 처리 | **`space_type`으로 추정** | 이미 받는 정보로 기존 공간도 값이 나온다. 추정치임은 API/UI에 명시 |
| 공간 수정 | **`PATCH` 추가** | 수정 수단이 없으면 "소급 정정"이 성립하지 않는다 |

## 데이터 흐름

```
아두이노    lux 측정 → 그대로 발행                    (PPFD 환산 제거)
Pi 브릿지   illuminance_lux 파싱 → envelope v2
백엔드      수집: lux를 Influx에 저장
            조회: pot → device → space → LightSource
                  PpfdConverter.ppfd(lux, source)
프론트      값 + 근거(ppfdBasis) 표시
```

핵심은 **저장은 실측값(lux)만, PPFD는 읽을 때 유도**한다는 것이다.

## 계약 변경 (envelope v2)

| 필드 | 변경 |
|---|---|
| `illuminance_lux` | 신규, 0~200000 lx |
| `plant_light_ppfd_umol_m2_s` | 필수 → 선택. 신규 노드는 보내지 않으며, 구버전 노드가 보내면 레거시 값으로만 쓴다 |

**둘 다 개별적으로는 선택이되, 최소 하나는 있어야 한다.** 수집 DTO에서 이 조건을
검증한다. 신규 노드는 lux를, 구버전 노드는 PPFD를 보내므로 전환 기간 동안 양쪽이
공존한다. 전환이 끝나면 `plant_light_ppfd_umol_m2_s`를 계약에서 제거하고
`illuminance_lux`를 필수로 올린다.

`schema_version`은 2를 유지한다. 필드 추가와 필수→선택 완화는 기존 수신자를
깨뜨리지 않으므로 버전을 올릴 이유가 없다.

## 펌웨어

`TB_PPFD_CALIBRATION_ENABLED`와 관련 계수 매크로(`TB_PPFD_PER_LUX`,
`TB_PPFD_OFFSET`, `TB_PPFD_CALIBRATED_MIN_LUX`, `TB_PPFD_CALIBRATED_MAX_LUX`)를
제거한다. 펌웨어는 `illuminance_lux`만 내보낸다.

`requiredFields()`에서 `kPpfdValid`가 빠진다. 필수는 기온·습도·조도가 되고
지온·수분은 기존대로 컴파일 옵션을 따른다. **배경 3번의 결합이 여기서 끊긴다.**

## Pi 브릿지

`protocol.py`의 `Event`:

```python
illuminance_lux: float | None = None   # 신규
ppfd_umol_m2_s: float | None = None    # 필수 → 선택
```

두 필드 모두 기본값 `None`이어야 한다. outbox는 JSON blob이라 **구버전 펌웨어가
큐에 넣어둔 행이 그대로 역직렬화돼야 하기 때문**이다(기존 주석에 명시된 제약).

`_reading(message, "illuminance_lux", 0.0, 200000.0)`으로 파싱해 envelope의
`measurements`에 싣는다. PPFD는 파싱만 하고 전송하지 않는다.

## 백엔드

### 스키마

`V10__add_space_light_source.sql`:

```sql
ALTER TABLE cultivation_space ADD COLUMN light_source VARCHAR(30);
```

nullable이다. `NULL`이 "모름 또는 미설정"이며, 기존 공간은 자동으로 여기 해당해
데이터 마이그레이션이 필요 없다.

### 광원과 계수

```java
public enum LightSource {
    NATURAL_LIGHT(0.0185),      // 태양광
    INDOOR_LIGHTING(0.0135),    // 냉백색 형광등
    WHITE_GROW_LED(0.0143);     // 백색 LED 4000K
}
```

세 값 모두 `origin/feature/arduino-ppfd-profiles`가 정리한 문헌 계수다. **실측
보정이 아니므로 측정값으로 취급해서는 안 된다.**

의도적으로 넣지 않은 것이 둘 있다.

- **혼합 광원**: 근거 있는 계수가 없다. 중간값을 지어내지 않는다.
- **적청(red/blue) 재배용 LED**: lux가 거의 잡지 못하는 파장에 출력이 몰려 있어
  실제 PPFD/lux가 백색 LED의 2~4배에 이른다. `WHITE_GROW_LED`를 적용하면 광량을
  심하게 과소평가한다. PAR 미터 실측 보정 없이는 다루지 않는다. UI 라벨을
  "백색 재배등"으로 좁혀 오적용을 막는다.

### 환산

`InfluxMeasurementStore`는 화분 단위로만 조회하므로 공간을 모른다. 따라서 환산은
저장소가 아니라 서비스 계층에 둔다.

```java
Double ppfd(TelemetrySample sample, CultivationSpace space)
```

박싱 타입인 이유는 값이 없을 수 있기 때문이다. 이에 맞춰
`LatestMeasurementsResponse.plantLightPpfdUmolM2S`와 점수 서비스가 쓰는 값도
`double`에서 `Double`로 바뀌며, 점수 계산은 광량이 null이면 해당 항목을 빼고
나머지로 평가한다.

1. `sample.illuminanceLux() != null` → `lux * coefficient(resolve(space))`
2. 아니면 저장된 레거시 `plant_light_ppfd_umol_m2_s` (과거 포인트에는 lux가 없다)
3. 둘 다 없으면 null

`MeasurementService`와 `EnvironmentScoreService`가 같은 컨버터를 쓴다. 점수
서비스는 현재 3곳에서 `sample.plantLightPpfdUmolM2S()`를 직접 부르고 있으며 모두
컨버터 경유로 바뀐다.

### space_type 폴백

`light_source`가 `NULL`일 때:

| space_type | 추정 광원 |
|---|---|
| 베란다 | `NATURAL_LIGHT` |
| 실내 유휴공간 | `INDOOR_LIGHTING` |
| 지하 공간 | `INDOOR_LIGHTING` |
| 그 외 문자열 | `NATURAL_LIGHT` |

`space_type`은 자유 문자열(VARCHAR 50)이라 미상 값의 기본이 필요하다.
`NATURAL_LIGHT`을 택한 것은 지금까지 펌웨어가 써온 0.0185와 같아 **기존 데이터와
연속성이 유지되기 때문**이다.

### 추정 근거 노출

```java
enum PpfdBasis { USER_SELECTED, INFERRED_FROM_SPACE_TYPE, LEGACY_DEVICE_VALUE }
```

`LatestMeasurementsResponse`에 `ppfdBasis`를 실어 프론트가 "추정" 표시를 붙일
근거로 삼는다.

### 측정 항목

`MeasurementMetric`에 `ILLUMINANCE_LUX("illuminance_lux", "lx")`를 추가한다.
신규 데이터는 lux만 저장하고 PPFD는 저장하지 않는다(파생값이므로).
시계열 조회에서 PPFD를 요청하면 서비스가 lux 시계열을 받아 환산해 돌려준다.

### 공간 수정

`PATCH /api/spaces/{id}` 를 추가하되 **`lightSource` 하나만** 수정 가능하게
좁힌다. 이름·유형·면적 수정은 이 작업의 범위가 아니며 각각 다른 파급이 있다
(면적은 관수 예산에 물려 있다).

## 프론트

**등록 폼** (`SetupFlow.tsx`) — 기존 `spaceTypeOptions` 옆에 추가한다.

```
주요 광원   ○ 자연광 위주      (창가·베란다 등 햇빛이 주된 곳)
            ○ 실내 조명 위주    (형광등·일반 LED 조명)
            ○ 백색 재배등       (백색·전스펙트럼 식물 재배용 LED)
            ● 잘 모르겠음       (공간 유형으로 추정합니다)
```

"잘 모르겠음"이 기본값이다. 필수로 만들지 않는 것은 온보딩 이탈을 늘리지 않기
위해서이며, `space_type` 폴백이 값을 만들어 준다.

`spaceApi.ts`의 `CreateCultivationSpaceInput`과 `CultivationSpaceResponse`에
`lightSource?: string`를 추가한다.

**광원 수정** — 공간 설정에서 광원만 바꾸는 작은 화면. `PATCH`를 호출한다.

**PPFD 표시** — `DashboardScreen` / `LiveScreen` / `HistoryScreen` 세 곳에서
광량을 보여준다. `ppfdBasis`가 `USER_SELECTED`가 아니면 값 옆에 "추정"을 붙인다.

## 호환성

| 상황 | 동작 |
|---|---|
| 구버전 노드(lux 미전송) | 수집 시 `illuminance_lux` 없음 → 레거시 PPFD 경로로 저장·조회 |
| outbox에 남은 구버전 행 | `Event` 기본값 `None`으로 역직렬화 성공 |
| 과거 Influx 포인트 | lux가 없으므로 저장된 PPFD를 그대로 사용 |
| 기존 공간(light_source NULL) | `space_type` 추정, `ppfdBasis=INFERRED_FROM_SPACE_TYPE` |

## 테스트

| 계층 | 내용 |
|---|---|
| `PpfdConverterTests` (신규) | 3종 계수, 레거시 폴백, space_type 추정, 미상 문자열 기본값 |
| `MeasurementApiIntegrationTests` | lux 수집 → 파생 PPFD와 `ppfdBasis` 응답 |
| `MeasurementServiceIngestTests` | lux만·PPFD만 각각 수집 성공, 둘 다 없으면 거부 |
| `CultivationSpaceApiIntegrationTests` | `PATCH`가 `lightSource`만 바꾸는지, 타 사용자 공간 거부 |
| `edge/pi/tests/test_protocol.py` | lux 파싱, PPFD 선택화, 구버전 outbox 행 역직렬화 |
| 펌웨어 | 테스트 프레임워크 없음 — 노드에서 수동 검증 |

## 작업 순서

계약이 먼저 서야 나머지가 붙는다.

1. 계약 문서 `device_model_and_telemetry_contract.md` §6 갱신
2. 펌웨어 — PPFD 환산 제거, lux 발행
3. 브릿지 — lux 파싱·전송, PPFD 선택화
4. 백엔드 — V10, `LightSource`, `PpfdConverter`, 수집·조회·점수, `PATCH`
5. 프론트 — 등록 폼, 광원 수정 화면, "추정" 표시

2와 3은 **함께 배포해야** 노드가 끊기지 않는다. 4는 레거시 폴백이 있어 먼저
나가도 안전하다.

## 남는 문제

- **적청 LED를 쓰는 사용자에게는 정확한 값을 줄 수 없다.** 현재는 선택지에서
  빼는 것으로 대응하지만, 실제로 그런 조명을 쓰는 사용자는 "실내 조명 위주"나
  "백색 재배등" 중 하나를 고르게 되고 어느 쪽도 맞지 않는다. PAR 미터 실측
  보정값을 직접 입력받는 경로가 근본 해법이다.
- **문헌 계수는 실측이 아니다.** 세 값 모두 분광 분포 가정에 기댄 근사이며,
  같은 "실내 조명"이라도 기구에 따라 편차가 크다.
- **공간에 광원이 하나라고 가정한다.** 창가에 재배등을 더한 경우처럼 섞인
  환경은 표현할 수 없다.
