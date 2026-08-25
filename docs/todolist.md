# TerraByte 개발 TODO

최종 갱신: 2026-08-04 (Asia/Seoul)
데모일: **2026-08-31** — 남은 기간 약 4주
기준: `ff4d306` + `feature/device-hierarchy` 미커밋 작업분

## 0. 확정된 결정 (Decision Log)

**이 문서의 모든 항목은 아래 결정을 전제로 한다. 되묻지 말고 이대로 진행한다.**
아직 정해지지 않은 것은 [§8 미결정 사항](#8-아직-결정되지-않은-사항)에 따로 모아 뒀다.

### 0.1 아키텍처 방향

| # | 쟁점 | 결정 | 반영 |
|---|---|---|---|
| D1 | 엣지↔서버 통신 | **MQTT로 전환.** Mosquitto 도입, 기존 HTTP outbox 구조는 transport만 교체 | P1-1~P1-3 |
| D2 | 이 문서의 범위 | **구조도 전체 목표.** 현재 코드 대비 gap 전부 | 문서 전체 |
| D3 | 신규 서브시스템 | **전부 포함.** 액추에이터 제어 + AI 서버(관수 회귀) + 엣지 Random Forest 폴백 + FCM 푸시 | P2, P3, P4 |
| D4 | 센서 구성 | **4종.** 대기 온습도 + PPFD + 토양 온도 + 토양 수분. 적합도 공식(T·H·L 기하평균)은 **변경하지 않음** | P1-5, P1-6 |
| D5 | 데모일 | **2026-08-31** | §2 |

### 0.2 기기 모델·계약

상세 설계는 아래 두 문서에 있으며, **충돌 시 그 문서가 우선한다.**

- [`design/device_model_and_telemetry_contract.md`](design/device_model_and_telemetry_contract.md) — 기기 모델·텔레메트리 계약
- [`design/edge_ai_hardening.md`](design/edge_ai_hardening.md) — 안전·복원력 보강 (관수 Governor, 펌웨어 인터록, 명령 생애주기, 엣지 자율 상태 기계, 관측성)

| # | 쟁점 | 결정 | 근거 |
|---|---|---|---|
| D6 | 계정–기기 1:1 제약 | **해제.** 4계층(계정 → 공간 → 게이트웨이 → 화분), 각 단계 N개 허용 | 공간 진단 서비스인데 "옥상"과 "지하실"을 비교할 수 없었음 |
| D7 | 화분(`pot`) 계층 도입 시점 | **지금.** 데이터가 쌓이기 전에 Influx 태그를 `pot_id` 기준으로 확정 | 나중에 바꾸면 태그 마이그레이션 + API 경로 + 프론트가 전부 딸려옴 |
| D8 | `device` → `gateway` 개명 | **개명하지 않음.** 테이블명 유지, 의미만 "게이트웨이"로 확정 | Java 6개 클래스·패키지·테스트·프론트 클라이언트 churn 대비 이득이 이름뿐 |
| D9 | `POST /api/telemetry` 존치 | **유지.** envelope v2 디버그·폴백 경로. v1 하위호환은 없음 | curl 한 줄로 전체 파이프라인 검증 가능 |
| D10 | `soil_moisture_raw_adc` | **필수 → 선택으로 완화** | Arduino가 emit하지 않는데 Spring이 필수로 요구해 계약이 깨져 있었음 |
| D11 | MQTT 토픽·인증 | **`tb/v2/{gatewayId}/up\|dn/...` + Mosquitto ACL.** 백엔드의 공용 `X-Device-Key` 검증 제거 | ACL이 토픽 위조를 막으므로 백엔드가 토픽의 gatewayId를 신뢰해도 됨 |
| D12 | 기기 오프라인 판정 | **MQTT LWT.** 별도 폴링 스케줄러 없음 | 브로커가 연결 끊김을 대신 알려줌 |
| D13 | 개발 테스트 코드 `123456` | **계정마다 전용 기기를 새로 생성.** D6로 계정당 N대가 허용되어 여러 번 써도 됨 | `#34` 기능을 4계층 위로 이관 |

### 0.3 안전·복원력 (2026-08-04 확정)

근거와 장애 시나리오는 [`design/edge_ai_hardening.md`](design/edge_ai_hardening.md) 참조.

| # | 쟁점 | 결정 | 근거 |
|---|---|---|---|
| D14 | 관수 명령 발행 권한 | **`IrrigationGovernor` 단일 관문.** 룰·AI·수동·엣지 어느 출처든 우회 불가 | 관문이 없으면 나머지 안전장치가 전부 "우회 가능한 권고"에 그침 |
| D15 | AI의 역할 | **"얼마나"만 제안. "여부"는 결정하지 않음.** 범위 이탈 출력은 클램프가 아니라 **폴백** | `99999`를 `200`으로 클램프하면 모델이 고장난 채 그럴듯한 값이 나감 |
| D16 | 엣지 판단 로직 | **클라우드 룰을 복제하지 않는다.** 훨씬 좁은 결정론적 긴급 규칙만 (15%·60mL·12시간·일 120mL) | 두 벌의 룰은 반드시 어긋남 |
| D17 | 엣지 Random Forest | **억제 전용.** 결정론적 게이트와 AND 결합 — 관수를 유발할 수 없고 억제만 가능 | 합성 데이터 학습 모델이 틀려도 안전 측 실패 |
| D18 | 펌프 정지 책임 | **Arduino 펌웨어의 `millis()` 인터록.** 상위 명령으로 완화 불가 | Orange Pi 프리즈 시 소프트웨어로는 절대 못 막음 |
| D19 | TTL 판정 주체 | **Orange Pi(벽시계) + Arduino(상대시간 `ms`).** Arduino는 TTL을 판정하지 않음 | Arduino에 RTC가 없음 |
| D20 | 명령 retain | **금지.** `up/status`만 retain | retain하면 재접속 시 오래된 관수 명령이 즉시 재실행 |
| D21 | 서버 생존 신호 | **`dn/heartbeat` 30초 주기.** 브로커 연결과 Spring 생존을 구분 | 브로커만 살아있으면 아무도 관수를 판단하지 않는 상태가 됨 |
| D22 | `event_id`의 Influx 위치 | **태그가 아니라 필드** | 샘플마다 고유한 값을 태그로 넣으면 시리즈 카디널리티 폭발 |

---

## 1. 현재 상태 (2026-08-04)

### 1.1 동작하는 것

| 영역 | 내용 |
|---|---|
| 백엔드 | Spring Boot 3.5.16 / Java 17. 인증(JWT), **다중 공간·다중 기기·다중 화분**, 작물 선택, HTTP 텔레메트리 수집, InfluxDB 저장·조회, 환경 적합도 점수, **토양 배지 추천(NORMAL 프로필)** |
| 엣지 (Orange Pi) | serial JSONL 수신·검증, SQLite durable outbox, 순서 보존 재전송, systemd 서비스 |
| 엣지 (Arduino) | DHT22(대기 온습도), TSL2591(조도) 기본 활성 |
| 프론트엔드 | Expo SDK 57 + RN Web. 7개 화면, 사이드바 내비게이션, 3초 폴링 provider. 인증·기기등록·작물선택·점수·토양추천은 실제 API |
| 검증 | 백엔드 테스트 **52건 통과**, 프론트 `tsc --noEmit` 통과 |

### 1.2 전혀 없는 것

MQTT · 액추에이터 제어(펌프/조명/히트패드) · 룰 엔진 · 이상 감지 · AI 서버 · Random Forest ·
FCM/푸시 · Docker Compose · CI · 배포 설정 · 토양온도 metric

### 1.3 🔴 여전히 깨져 있는 것 — 하드웨어가 백엔드에 도달하지 못한다

Orange Pi와 Spring이 서로 다른 계약을 구현하고 있어, 현재 코드로는 텔레메트리가 한 건도 도착할 수 없다.

| | Orange Pi가 보내는 것 | Spring이 받는 것 |
|---|---|---|
| 경로 | `POST /api/crop-contexts/{contextId}/environment-observations` | `POST /api/telemetry` |
| 인증 | `Authorization: Bearer <device token>` | `X-Device-Key` |
| 성공 코드 | `201` 기대 | `202` 반환 |
| 본문 | camelCase 5필드 | snake_case envelope |
| 습도 필드 | `relativeHumidityPct` | `air_humidity_pct` |
| 광량 필드 | `ppfdUmolM2S` | `plant_light_ppfd_umol_m2_s` |
| 토양수분 | 전송 안 함 | 필드 존재 (D10으로 선택 완화 예정) |

게다가 Arduino는 기본 설정에서 PPFD 보정이 꺼져 있어 `telemetry`가 아니라 `sensor_status`만 내보낸다.

**해결책은 계약 v2 하나로 통일하는 것이며, MQTT 전환과 같은 작업이다.** → P1

### 1.4 🔴 관수 제어에 안전장치가 하나도 없다

[`design/edge_ai_hardening.md`](design/edge_ai_hardening.md) §1의 취약점 분석 요약이다.
액추에이터를 붙이기 **전에** 아래를 해결하지 않으면 데모에서 물이 넘칠 수 있다.

| # | 취약점 | 근거 | 대응 |
|---|---|---|---|
| V1 | 펌프를 물리적으로 멈출 주체가 없다 | `edge/arduino`에 액추에이터·안전 상수 코드가 전무. 관수 중 Orange Pi 프리즈 시 **물탱크가 빌 때까지 펌프 구동** | P2-1, P2-2 (D18) |
| V2 | 명령 중복·지연 실행 방지 장치가 없다 | MQTT QoS1은 at-least-once. 2시간 오프라인 후 재접속 시 큐잉된 6건이 한꺼번에 실행 | P1-8, P2-8 (D20) |
| V3 | 판단 입력의 신선도 하한이 없다 | `InfluxMeasurementStore.findLatest`가 `range(start: 1970-01-01)`. `validateObservedAt`은 미래 5분만 차단 | P1-8 |
| V4 | outbox 단일 FIFO — head-of-line blocking | `service.py._upload_once`가 실패 시 `break`. 텔레메트리 1건이 엣지 관수 이력을 가둠 → **서버가 예산을 초과 승인** | P2-9 |
| V5 | 노드 자동 바인딩에 상한이 없다 | `MeasurementService.bindNode`가 화분을 무한 생성. `TB_NODE_ID` 기본값이 `UNCONFIGURED` | P1-5, P2-8 |
| V6 | MQTT 연결과 Spring 생존을 동일시 | 브로커만 살아있으면 자율 모드 전환이 안 돼 **아무도 관수를 판단하지 않음** | P1-2, P2-9 (D21) |
| V7 | 관수 판단 입력이 지금 존재하지 않는다 | 토양수분이 컴파일 타임에 비활성이고 점수에도 미반영 | P1-5, P1-6 |
| V8 | AI 응답을 검증 없이 신뢰하는 경로 | 합성 데이터 학습 시 분포 밖 입력이 기본값이 됨 | P1-8 (D15) |

### 1.5 미커밋 상태

`feature/device-hierarchy` 브랜치 워킹 트리에 P0 작업분이 커밋되지 않은 채 남아 있다.
커밋 시 **문서와 백엔드 구현을 별도 커밋·별도 PR로 분리**한다 (PR 하나 = 논리적 변경 하나).

- 문서 → `docs/device-model-and-contract` : `docs/design/`, `docs/todolist.md`
- 백엔드 → `feature/device-hierarchy` : `backend/`

`backend/gradle.properties`와 `docs/indoor_potting_substrate_recommendations_agent.json`은 이전부터 untracked였다.
후자는 upstream `#32`가 `backend/src/main/resources/soil/`에 동일 파일(94,760 B)을 추가했으므로 삭제해도 된다.

---

## 2. 단계 계획

| Phase | 기간 | 목표 | 데모 |
|---|---|---|---|
| **P1** | 8/05 – 8/11 | **관수 안전 게이트웨이** + 계약 v2 통일 + MQTT 백본 + 인프라. 하드웨어→대시보드 E2E 1회 성공 | ✅ 필수 |
| **P2** | 8/12 – 8/18 | 액추에이터 + **펌웨어 인터록** + **명령 생애주기** + 룰 엔진 + **엣지 자율** + **관측성** | ✅ 필수 |
| **P3** | 8/19 – 8/25 | AI 서버(관수 회귀) + 엣지 RF + 프론트 mock 제거 | ⚠️ 핵심 차별점 |
| **P4** | 8/26 – 8/31 | FCM 푸시 + 모바일 빌드 + CI + 데모 리허설 + 문서 정정 | ⚠️ 여유분 |

> 일정이 밀릴 경우 버리는 순서: FCM 푸시 → 엣지 RF → AI 회귀 모델(규칙 기반 고정 관수량으로 대체).
> **P1-8·P2-1 인터록·P2-8은 절대 버리지 않는다.** 이 셋이 빠지면 실물 관수 데모 자체가 위험하다.
> 룰 엔진 + Governor + 인터록 + 엣지 결정론 규칙만으로도 "안전한 자동 관수"라는 주장은 성립한다.

**가장 먼저 착수할 3개** ([근거](design/edge_ai_hardening.md#7-가장-먼저-구현할-작업-3개))

| 순서 | 작업 | 선행 |
|---|---|---|
| 1 | **P1-8 관수 안전 게이트웨이** — 하드웨어·MQTT 없이 지금 착수 가능 | 없음 |
| 2 | P2-8 명령 생애주기 + TTL | P1-8, P1-2 |
| 3 | P2-1 Arduino 하드 인터록 — 회로 리드타임이 있어 1과 **병렬** 착수 | 회로 부품 |

---

## P0 잔여 — 설계 대비 편차 (후속 처리)

- [ ] `uq_pot_device_node`를 부분 unique index 대신 일반 `UNIQUE(device_id, node_id)`로 구현
      (H2 미지원). PostgreSQL 전용으로 확정되면 부분 인덱스로 되돌릴 것
- [ ] `node_id`를 envelope v1의 `context.zone_id`에서 임시로 읽는 중 → P1-2에서 `nodes[].node_id`로 교체
- [ ] `CropSelectionResponse`·`LatestMeasurementsResponse`·`EnvironmentScoreResponse`·`SoilRecommendationResponse`의
      `deviceId` 필드가 값은 `potId`다. 프론트가 이 값을 재사용하지 않아 지금은 무해하나 P3-6에서 개명할 것
- [ ] `DeviceService`가 주입된 `Clock` 대신 `Instant.now()` 사용 — 테스트 시간 고정 불가
- [ ] V4가 심은 `claim_code = '123456'` 기기(`orangepi-pro-02`)는 D13 가로채기 때문에 아무도 claim할 수 없다.
      실기 2호를 붙일 거면 별도 코드 발급 필요

---

## P1. 계약 통일 · MQTT 백본 · 인프라 (8/05 – 8/11)

### P1-1. Mosquitto 브로커 + 인프라 재현성
브랜치: `chore/docker-compose-infra`

- [ ] `docker-compose.yml` — PostgreSQL + InfluxDB + Mosquitto 한 번에 기동
- [ ] `infra/mosquitto/mosquitto.conf` — 익명 접속 차단
- [ ] ACL 파일 — 게이트웨이는 `tb/v2/{자기 id}/up/#` 발행, `.../dn/#` 구독만 허용 (D11)
- [ ] 자격증명 10개 사전 발급 — Mosquitto 패스워드 파일 + `device.mqtt_password_hash`에 bcrypt 저장
- [ ] TLS (데모는 자체 서명 인증서, 운영 계획만 문서화)
- [ ] InfluxDB·PostgreSQL 초기화를 compose에 포함 (현재 수동 `docker run`만 존재)
- [ ] `backend/README.md`의 수동 docker 명령을 compose 기준으로 갱신

### P1-2. 텔레메트리 계약 v2 + 백엔드 MQTT 수신
브랜치: `feature/telemetry-contract-v2` — 설계 문서 §6. 선행: P1-1

- [ ] `TelemetryEnvelope` DTO — 게이트웨이 1건 + 노드 배열
- [ ] 전송과 페이로드 분리 — MQTT 구독자와 HTTP 컨트롤러가 같은 DTO·서비스 사용
- [ ] MQTT 클라이언트 의존성 (Eclipse Paho 또는 Spring Integration MQTT)
- [ ] `app.mqtt.*` 설정 (broker URL, 자격증명, clientId, 토픽 prefix)
- [ ] `tb/v2/+/up/telemetry` 구독 — 토픽의 gatewayId를 신뢰 (ACL이 위조 차단)
- [ ] 공용 `X-Device-Key` 검증(`MeasurementService.authenticateDevice`) 제거
- [ ] `POST /api/telemetry`는 envelope v2만 수용, `schema_version != 2`면 400 (D9)
- [ ] HTTP 수집을 `app.telemetry.http-ingest.enabled`로 게이트 (기본 `false`)
- [ ] `event_id`(outbox UUID) 기반 중복 수집 차단
- [ ] `up/status` LWT 구독 → 게이트웨이·화분 ONLINE/OFFLINE 자동 갱신 (D12)
- [ ] 브로커 재연결·구독 복구
- [ ] `node_id`를 `nodes[].node_id`에서 읽도록 교체 (P0 잔여 항목 해소)
- [ ] MQTT 수집 통합 테스트 (embedded broker 또는 Testcontainers)

### P1-3. 엣지 Orange Pi MQTT 전환
브랜치: `feature/edge-mqtt-transport` — 설계 문서 §8.1. 선행: P1-2

- [ ] `Publisher` 프로토콜 추출 (`send(Event) -> DeliveryResult`)
- [ ] `MqttPublisher` 구현 (paho-mqtt), 기존 `BackendClient`는 `HttpPublisher`로 개명·유지
- [ ] `Event.backend_body()`를 envelope v2 생성으로 교체
- [ ] `config.py`에 `TB_MQTT_HOST/PORT/USERNAME/PASSWORD/TLS/TOPIC_PREFIX`
- [ ] LWT 등록 및 접속 시 status retain 발행
- [ ] SQLite outbox는 **변경하지 않는다** — 발행 실패 시 순서 보존 재전송만 확인
- [ ] `DeliveryResult` 판정을 HTTP status → 발행 결과/PUBACK 기준으로 재작성
- [ ] `terrabyte-edge.env.example`, `terrabyte-edge.service` 갱신
- [ ] 기존 테스트 6종 갱신 + MQTT publisher 테스트 신규

### P1-4. Orange Pi 실기 배포
브랜치: `chore/edge-deploy`

- [ ] SSH 키 인증 설정 (현재 비밀번호 인증, `ssh-copy-id orangepi@192.168.0.7`)
- [ ] `edge/pi` 실기 배포 및 systemd 서비스 기동 확인
- [ ] 실제 USB serial 장치 식별자 확인 및 `.env` 작성
- [ ] 부팅 시 자동 시작 및 재시작 정책 확인

### P1-5. Arduino 기본 설정 정상화
브랜치: `fix/arduino-default-sensors`

- [ ] PPFD 보정(`TB_PPFD_CALIBRATION_ENABLED`) 활성화 및 lux→PPFD 계수 확정
      — **미결정: 실측 vs 문헌 계수 (§8-1)**
- [ ] DS18B20 토양온도(`TB_SOIL_TEMPERATURE_ENABLED`) 기본 활성화
- [ ] 정전용량 토양수분(`TB_SOIL_MOISTURE_ENABLED`) 기본 활성화 + dry/wet ADC 보정값 측정·기록
- [ ] `soil_moisture_raw_adc` 필드 emit 추가
- [ ] 4종 센서 전부 활성 상태에서 `telemetry`가 정상 emit되는지 실기 확인

### P1-6. 토양온도 metric 백엔드 반영
브랜치: `feature/soil-temperature-metric`

- [ ] `MeasurementMetric`에 `soil_temperature_c` 추가
- [ ] `TelemetryEnvelope`, `TelemetrySample`, `InfluxMeasurementStore`, `LatestMeasurementsResponse` 반영
- [ ] 통합 테스트 fixture·assertion 갱신
- [ ] 적합도 종합점수 공식은 **변경하지 않는다** — 토양온도는 모니터링 전용 (D4)

### P1-8. 관수 안전 게이트웨이 (보강 개선 1) ⭐ P1 최우선
브랜치: `feature/irrigation-governor` — [설계](design/edge_ai_hardening.md#8-작업-1-상세-설계--바로-개발-가능한-수준). **선행 없음 — 하드웨어·MQTT 불필요, 지금 착수 가능**

V2·V3·V8을 한 지점에서 차단한다. 이 관문이 없으면 나머지 안전장치가 전부 우회 가능해진다 (D14).

- [ ] Flyway `V11__create_irrigation_decision.sql` — 승인·거부 전건 원장
- [ ] Flyway `V12__create_device_command.sql` — 명령 상태·실행 결과. `actual_ml`이 예산의 유일한 근거
- [ ] `com.terrabyte.backend.irrigation` 패키지 — `IrrigationGovernor`, `IrrigationProperties`, `AuthorizationResult`, 리포지토리 2종
- [ ] 게이트 1 신선도 — 10분 초과 시 `INPUT_STALE`
- [ ] 게이트 2 센서 유효성 — `soil_sensor_valid=false` 또는 범위 이탈
- [ ] 게이트 3 급변 감지 — 60초 내 30%p 이상 변동
- [ ] 게이트 4 쿨다운 6시간 — 수동 override만 우회 가능, `override_reason` 필수
- [ ] 게이트 5 진행 중 명령 — `IN_FLIGHT` 차단 + 부분 유니크 인덱스
- [ ] 게이트 6 일일 예산 600mL — `COALESCE(actual_ml, granted_ml)` 합산
- [ ] 게이트 7 1회 20~200mL 클램프
- [ ] `MeasurementStore.findLatestWithin(potId, maxAge)` 추가 — `range(start: 1970)` 문제 해소 (V3)
- [ ] AI 출력 검증 — 범위 이탈 시 클램프가 아니라 **폴백** (D15). 화분 용적별 기본 관수량 표
- [ ] `Clock` 주입 — 쿨다운·예산·TTL 경계값을 결정론적으로 테스트
- [ ] `POST /api/pots/{potId}/irrigation` 수동 관수, 거부 시 `nextAvailableAt` 반환
- [ ] `IrrigationGovernorTests` 10건 — 설계 문서 §2 개선 1 테스트 시나리오
- [ ] **완료 조건: 어떤 입력 조합으로도 1회 200mL 또는 24시간 600mL 초과 승인이 나오지 않을 것**

이번 범위 제외: MQTT 발행(P2-8), 룰 엔진 자동 트리거(P2-5), AI 연동(P3-4), 엣지 이력 수신(P2-9)

### P1-9. E2E 관통 검증
브랜치: `test/e2e-telemetry-path` — 선행: P1-3, P1-5, P1-8

- [ ] Arduino(mock 또는 실기) → Orange Pi → MQTT → 백엔드 → InfluxDB → 프론트 대시보드 1회 성공
- [ ] `POST /api/telemetry`에 envelope v2를 curl로 보내 같은 경로 동작 확인
- [ ] 노드 자동 바인딩 — 신규 `node_id` 수신 시 화분이 자동 생성되는지
- [ ] 브로커 중단 → outbox 적재 → 복구 후 순서대로 재전송
- [ ] 검증 절차를 `docs/e2e_checklist.md`로 문서화

---

## P2. 액추에이터 제어 · 룰 엔진 (8/12 – 8/18)

### P2-1. 액추에이터 하드웨어 회로
브랜치: `feature/arduino-actuators`

- [ ] MOSFET 구동 회로 3채널 (관수 펌프 / LED 조명 / 히트패드)
- [ ] 12V 외부 전원 분리 및 공통 GND 설계 확인
- [ ] 출력 핀 배치 확정 및 `TelemetryConfig.h`에 상수화
- [ ] 히트패드 과열 차단 임계값 및 최대 듀티 사이클
- [ ] 물탱크 수위 센서 도입 여부 결정 — 없으면 빈 탱크 공회전을 감지할 수단이 없다

**하드 인터록 4종 (보강 개선 2, D18)** — 상위 명령으로 완화 불가. 신규 `ActuatorGuard.{h,cpp}`

- [ ] G1 절대 최대 구동시간 — `TB_PUMP_ABS_MAX_MS 30000`. 명령의 `ms`가 더 커도 무시
- [ ] G2 최소 재구동 간격 — `TB_PUMP_MIN_INTERVAL_MS 600000`. 서버 쿨다운(6시간)보다 **항상 짧게**
- [ ] G3 데드맨 워치독 — 구동 중 호스트 무응답 3초면 즉시 정지. Orange Pi가 1초 주기 `{"t":"ka"}` 전송
- [ ] G4 부팅 안전 — `setup()` 최초 3줄에서 모든 액추에이터 핀 `OUTPUT`+`LOW`, serial 초기화보다 먼저
- [ ] 명령 ID 링버퍼 8개 — 같은 `id` 재실행 차단 (V2 최종 방어선)
- [ ] `telemetry`에 `actuators` 상태와 `pump_lockout_ms` 추가
- [ ] **실측 검증: `ms:60000` → 30초 강제 정지 / 구동 중 USB 분리 → 3초 내 정지 / 구동 중 리셋 → 즉시 OFF**

### P2-2. Arduino 명령 수신 프로토콜
브랜치: `feature/arduino-command-protocol`

- [ ] serial inbound JSONL 파서 (현재 출력 전용)
- [ ] 명령 스키마 — `command_id`, `actuator`, `action`, `duration_ms`, `volume_ml`
- [ ] `command_ack` 응답 및 실패 사유 코드
- [ ] 액추에이터 현재 상태를 `telemetry`/`sensor_status`에 포함
- [ ] 워치독 — Orange Pi 연결 끊김 시 진행 중 명령 안전 종료
- [ ] 중복 `command_id` 무시

### P2-3. 엣지 명령 중계
브랜치: `feature/edge-command-relay`

- [ ] MQTT `dn/command` 구독 → serial 명령 전달
- [ ] serial `command_ack` → MQTT `up/ack` 발행
- [ ] 명령 타임아웃 및 미응답 처리
- [ ] 액추에이터 상태를 `up/status`로 주기 발행
- [ ] 테스트 추가

### P2-4. 백엔드 액추에이터/명령 도메인
브랜치: `feature/backend-actuator-command`

- [ ] Flyway — `actuator`, `device_command`(대상 화분, 액추에이터, 동작, 파라미터, 상태, 발행/ack 시각)
- [ ] `POST /api/pots/{potId}/commands` — 수동 제어 (소유자 인증)
- [ ] `GET /api/pots/{potId}/commands?limit=` — 명령 이력
- [ ] `GET /api/pots/{potId}/actuators` — 현재 상태
- [ ] MQTT 명령 발행 + ack 수신 시 상태 갱신
- [ ] 안전 가드 — 최소 관수 간격, 1회 최대 관수량, 동시 명령 차단
- [ ] 통합 테스트

### P2-5. 룰 기반 엔진
브랜치: `feature/rule-engine`

- [ ] 룰 정의 방식 확정 — **미결정 (§8-3)**
- [ ] 관수 룰 — 토양수분 임계값 하회 + 최소 관수 간격 경과
- [ ] 조명 룰 — PPFD 부족 + 작물별 광주기(DLI) 목표
- [ ] 히트패드 룰 — 토양/대기 온도 하한 미달
- [ ] 이상 상태 룰 — 센서 무응답, 값 범위 이탈, 급격한 변화
- [ ] `@EnableScheduling` + 주기 평가 스케줄러 (현재 스케줄링 자체가 없음)
- [ ] 평가 결과 이력 저장
- [ ] 룰 단위 테스트

### P2-6. 기기·화분 상태 API
브랜치: `feature/device-status-api`

D12(LWT) 덕분에 폴링 스케줄러와 미수신 임계 시간 판정이 불필요해졌다. 남은 건 조회와 연동뿐이다.

- [ ] `GET /api/devices/{deviceId}/status` — LWT로 갱신된 상태 조회
- [ ] 화분(노드) 단위 상태도 함께 반환
- [ ] 설치 안내 화면 상태 폴링 연동

### P2-8. 명령 생애주기 · TTL · ACK (보강 개선 3)
브랜치: `feature/command-lifecycle` — [설계](design/edge_ai_hardening.md#개선-3-명령-생애주기와-ttl--at-most-once-실행). 선행: P1-8, P1-2

P1-8의 예산 계산에 **실행 결과**를 공급한다. 이게 없으면 Governor의 일일 예산이 무의미해진다.

- [ ] `dn/command` 스키마 — `command_id`(ULID), `correlation_id`, `expires_at`, `safety` 블록
- [ ] `up/ack` 스키마 — 4개 phase(`accepted`/`rejected`/`completed`/`aborted`)가 하나의 스키마 공유
- [ ] `dn/heartbeat` 토픽 30초 주기 — 브로커 연결과 Spring 생존을 구분 (V6, D21)
- [ ] **명령 retain 금지** (D20). `up/status`만 retain
- [ ] TTL 3중 판정 — Spring(발행 전) / Orange Pi(수신 시 벽시계) / Arduino(판정 안 함, D19)
- [ ] 서버 명령 상태 기계 — `ISSUED→ACCEPTED→COMPLETED` / `REJECTED` / `ABORTED` / `EXPIRED`
- [ ] TTL 만료 스윕 — ack 없이 만료 시 `EXPIRED` 전이, **예산에서 빼지 않음**(실행됐을 수 있음)
- [ ] 지연 ack 수신 시 `actual_ml` 정정, 중복 가산 방지
- [ ] 노드 자동 바인딩 상한 — 기기당 최대 화분 수 제한 (V5)
- [ ] **완료 조건: 2시간 오프라인 후 재접속 시 큐잉된 명령의 실행 횟수가 정확히 0**

### P2-9. 엣지 자율 상태 기계 (보강 개선 4)
브랜치: `feature/edge-autonomy` — [설계](design/edge_ai_hardening.md#31-상태-기계). 선행: P2-8

클라우드 장애 중 최소 기능 유지. **P1-8·P2-8 없이 만들면 오히려 과도 관수의 새 경로가 된다.**

- [ ] 상태 기계 `state.py` — `BOOT→LINK_UP→CLOUD_ONLINE⇄CLOUD_DEGRADED→EDGE_AUTONOMOUS→RESYNC` + `SAFE_HOLD`
- [ ] 히스테리시스 — DEGRADED 진입 30초 / AUTONOMOUS 진입 15분 / ONLINE 복귀 60초
- [ ] `dn/heartbeat` 90초 무수신 시 DEGRADED 전이 (V6·F7)
- [ ] 결정론적 긴급 규칙 `guard.py` — 15% 미만·60mL·12시간 간격·일 120mL (D16)
- [ ] outbox 이중 큐 — `kind IN ('telemetry','control')` 독립 배수 (V4·F5)
- [ ] `mark_dead` 판정 재정의 — MQTT엔 4xx가 없다. 로컬 스키마 검증 실패만 격리
- [ ] `up/status`에 `state`·`clock_synced`·`outbox` 깊이 포함
- [ ] `RESYNC` 중 서버가 명령 발행을 억제
- [ ] `RESYNC→CLOUD_ONLINE` 전이는 control 큐 배수 완료 후에만
- [ ] NTP 미동기 부팅 시 `SAFE_HOLD` — 관수 잠금, 텔레메트리는 계속
- [ ] **완료 조건: 복구 후 서버 일일 예산에 엣지 관수량이 정확히 반영될 것**

### P2-10. 종단 관측성 (보강 개선 5)
브랜치: `feature/observability` — [설계](design/edge_ai_hardening.md#개선-5-종단-관측성--correlation-id-체인)

데모 당일 "왜 물을 안 주지?"에 30초 안에 답할 수 있게 한다.

- [ ] correlation ID 체인 — `protocol.py`가 이미 부여하는 outbox UUID를 그대로 사용, 새로 만들지 않음
- [ ] Influx에 `event_id`를 **필드로** 기록 (태그 금지, D22)
- [ ] 구조화 JSON 로그 — Spring MDC / Python `LoggerAdapter`. 텔레메트리는 `DEBUG`, 판단·명령은 `INFO`
- [ ] Micrometer 카운터 7종 — `irrigation_decision_total`, `irrigation_volume_ml_total`, `command_ack_latency_seconds` 등
- [ ] `/actuator/prometheus` 노출 + Security 규칙 (현재 `health,info`만 노출 중)
- [ ] `GET /api/pots/{potId}/irrigation-timeline` — 센서값→판단→명령→정지사유를 한 번에
- [ ] **완료 조건: 임의의 관수 1건을 correlationId 하나로 전 구간 재구성 가능. 거부 사례도 timeline에 포함**

### P2-11. 프론트엔드 제어 UI
브랜치: `feature/frontend-actuator-control`

- [ ] 명령 발행·상태 조회 API 클라이언트 추가
- [ ] 대시보드에 액추에이터 3종 상태 카드 + 수동 ON/OFF
- [ ] 관수 실행 버튼 (관수량 입력 또는 권장량 표시)
- [ ] 명령 진행/성공/실패 피드백
- [ ] 자동/수동 모드 토글
- [ ] 명령 이력 화면 또는 History 화면에 통합

---

## P3. AI 서버 · RF 폴백 · 실데이터화 (8/19 – 8/25)

### P3-1. ML 데이터 계약 확정
브랜치: `docs/ml-contract`

- [ ] 입력 피처 확정 (현재/최근 토양수분, 토양온도, 대기 온습도, PPFD, 작물, 화분 부피, 마지막 관수 이후 경과시간 등)
- [ ] 출력 확정 (권장 관수량 mL, 신뢰도)
- [ ] REST 계약 문서화 (`POST /predict/irrigation`)
- [ ] 백엔드가 피처를 조달하는 방식 확정 (InfluxDB 조회 범위·집계)

### P3-2. 학습 데이터 확보
브랜치: `feature/ml-dataset`

- [ ] 데이터 출처 확정 — **미결정 (§8-2)**
- [ ] 수집·라벨링 절차 문서화
- [ ] 학습/검증 분할 및 평가 지표(MAE 등) 정의
- [ ] 데이터셋을 저장소에 커밋할지 외부 보관할지 결정

### P3-3. AI 서버 구축
브랜치: `feature/ai-server`

- [ ] `ai-server/` 신설 — FastAPI 권장
- [ ] 관수량 회귀 모델 학습 스크립트 + 모델 아티팩트
- [ ] 전처리 로직을 학습/추론 간 공유하도록 모듈화
- [ ] `POST /predict/irrigation` + `/health`
- [ ] 인증 방식 결정 (내부 네트워크 전용 vs API 키)
- [ ] Dockerfile + docker-compose 편입
- [ ] 예측 테스트 및 입력 검증

### P3-4. 백엔드 ↔ AI 서버 연동
브랜치: `feature/backend-ai-client`

- [ ] AI 서버 HTTP 클라이언트 + 타임아웃/재시도
- [ ] 룰 엔진 "관수 필요" 판정 → AI 호출 → 관수량 명령 발행
- [ ] AI 서버 장애 시 폴백 (룰 기반 고정 관수량)
- [ ] 예측 결과와 실제 관수 결과를 저장 (재학습용)
- [ ] 통합 테스트 (AI 서버 mock)

### P3-5. 엣지 Random Forest (억제 전용)
브랜치: `feature/edge-rf-fallback`. 선행: P2-9

**상태 기계·긴급 규칙·오프라인 동기화는 P2-9로 이관됐다.** 여기 남은 것은 RF 모델뿐이며,
RF는 **결정론적 게이트와 AND로 결합해 관수를 억제만 할 수 있다** (D17).
모델이 없거나 스키마가 불일치하면 결정론적 규칙만으로 정상 동작해야 한다.

- [ ] 경량 RF 모델 학습 및 배포 형식 (joblib vs ONNX vs 순수 파이썬 규칙 트리)
- [ ] 전처리를 모델 아티팩트에 동봉 (train/serve skew 차단)
- [ ] `model_version`·`input_schema_version` 검증 — 불일치 시 모델 폐기 후 결정론 규칙만 사용
- [ ] 추론 런타임 추가 — **Orange Pi 성능 여유 확인 필요 (§8-5)**
- [ ] **테스트: RF가 관수를 권고해도 토양수분 30%면 관수하지 않을 것**

### P3-6. 프론트엔드 실데이터화
브랜치: `feature/frontend-real-data`

`src/data.ts`가 아직 광범위한 static 데이터를 공급한다. Guide 화면의 토양 추천만 실제 API로 전환된 상태다.

- [ ] `measurementApi`에 시계열 클라이언트 추가 — `GET /api/pots/{id}/measurements?metric=&range=` (현재 클라이언트 없음)
- [ ] Dashboard 변화 차트를 실제 시계열로 교체
- [ ] Live 화면 센서 목록·확장 지표를 실제 metric으로 교체 (토양온도 포함)
- [ ] History 화면의 component-local static 기록 → 실제 이력 API 연동
- [ ] Analysis 화면의 대체작물 점수·개선계획·일정을 실제 API 또는 명시적 "예시" 라벨로 정리
- [ ] API 클라이언트를 device 스코프 → pot 스코프로 전환 (deprecated 별칭 사용 중단)
- [ ] 응답의 `deviceId` 필드를 `potId`로 개명 (P0 잔여 항목 해소)
- [ ] Guide/Shop 상품 카탈로그는 데모 범위상 static 유지 — **문서에 명시**

### P3-7. 적합도 이력
브랜치: `feature/environment-score-history`

- [ ] `GET /api/pots/{potId}/scores`
- [ ] 점수 저장 방식 결정 (사전 계산 저장 vs 조회 시 계산)
- [ ] 기간별 적합도 변화 조회
- [ ] 오래된 측정값의 최대 유효시간 확정
- [ ] `EnvironmentScoreService` 통합 테스트 (현재 미검증)

---

## P4. 알림 · 모바일 · 마무리 (8/26 – 8/31)

### P4-1. FCM 푸시 알림
브랜치: `feature/fcm-push`

- [ ] Firebase 프로젝트 생성 및 서비스 계정 키 발급 (GitHub Secrets로 관리)
- [ ] 백엔드 — Firebase Admin SDK, `fcm_token` 테이블, 토큰 등록 API
- [ ] 룰 엔진 이상 상태 판정 → FCM 발행
- [ ] 알림 유형 정의 (이상 상태, 관수 완료, 기기 오프라인)
- [ ] 중복 발송 억제 (동일 이상 상태 재알림 간격)
- [ ] 프론트 — `expo-notifications`, 권한 요청, 토큰 등록, 포그라운드/백그라운드 핸들러
- [ ] 헤더의 고정 문구 `"현재 습도는 45%"`를 실제 알림 데이터로 교체

### P4-2. 모바일 빌드
브랜치: `chore/mobile-build`

- [ ] iOS `bundleIdentifier` 설정 (현재 `app.json`에 없음)
- [ ] `RootShell`의 web 전용 `minHeight: '100vh'` (`as any`) 등 native 비호환 스타일 정리
- [ ] EAS preview 빌드로 Android APK 실제 생성·설치 확인
- [ ] 모바일 레이아웃 점검 (현재 사이드바 기반 웹 레이아웃)

### P4-3. CI 및 운영 준비
브랜치: `ci/github-actions`

- [ ] GitHub Actions — backend `./gradlew test`, frontend `npx tsc --noEmit`, edge `pytest`
- [ ] 운영 JWT·DB·MQTT·Firebase 비밀값을 GitHub Secrets로 분리
- [ ] 개발/테스트/운영 프로필 분리
- [ ] Swagger/OpenAPI 문서
- [ ] HTTPS 및 운영 CORS 설정 (현재 CORS allowed headers에 `X-Device-Key` 없음)
- [ ] InfluxDB 보존 정책 및 장기 시계열 다운샘플링
- [ ] PostgreSQL/InfluxDB 백업 정책

### P4-4. 데모 준비
브랜치: `docs/demo-scenario`

- [ ] 데모 시나리오 대본 (진단 → 설치 → 모니터링 → 자동 관수 → 알림)
- [ ] 데모용 시드 데이터 (실시간 데이터가 부족할 경우 대비)
- [ ] 네트워크 장애 대비 오프라인 데모 경로
- [ ] 리허설 2회

### P4-5. 문서 정합성 정리
브랜치: `docs/fix-inconsistencies`

실제 코드와 어긋난 것이 확인된 항목이다. 데모 전 반드시 정정한다.

- [ ] `README.md`: "Next.js 14" → Expo SDK 57 + React Native Web
- [ ] `README.md`: "ESP32 기반 7종 센서" → ATmega328P + 4종 센서
- [ ] `README.md`: "AWS EC2 배포·운영" → 배포 설정 없음 (P4-3 완료 후 정정)
- [ ] `README.md`: "AI 기반" 진단/작물 추천 → 현재 결정론적 사다리꼴 공식. P3 완료 후 범위 명확화
- [ ] `README.md`: "비용 산출 로직 구현" → 백엔드에 해당 도메인 없음
- [ ] `HANDOFF.md`: "프론트엔드는 모든 데이터를 REST API로 조회" → 상당 부분 `data.ts` static
- [ ] `HANDOFF.md`: telemetry 계약 구현 완료 → 엣지와 불일치했음 (P1 해소 후 갱신)
- [ ] `HANDOFF.md`: 계정당 1기기 전제 전반 → D6로 무효
- [ ] `edge/pi/README.md`: crop-context observation 계약 → MQTT 계약으로 전면 갱신
- [ ] `edge/arduino/README.md`: "backend v1 contract accepts the serial record" → 사실 아님
- [ ] 정리 완료 후 `HANDOFF.md` 전체 갱신

---

## 3. 상시 기술 부채

데모 필수는 아니지만 남아 있는 항목이다.

- [ ] 센서 값 범위 검증 강화 (백엔드)
- [ ] InfluxDB 장애 시 백엔드 재시도/임시 저장 정책
- [ ] 기기 등록 해제 및 `claim_code` 재발급 API (컬럼만 준비됨)
- [ ] 기기·화분 삭제 API
- [ ] MQTT 자격증명 동적 발급 (`dynamic-security` 플러그인) — P1-1은 사전 발급 10개
- [ ] `backend/db/schema.sql`과 `backend/db/migrations/`가 Flyway 관리 밖 — SQLite 스키마 버전 관리 정리
- [ ] 개발 테스트 기기가 DB에 누적됨 (테스트 리셋이 삭제하지 않음)
- [ ] `backend/gradle.properties` untracked — 커밋 여부 결정

---

## 4. 브랜치 목록

| Phase | 브랜치 |
|---|---|
| P1 | **`feature/irrigation-governor`**, `chore/docker-compose-infra`, `feature/telemetry-contract-v2`, `feature/edge-mqtt-transport`, `chore/edge-deploy`, `fix/arduino-default-sensors`, `feature/soil-temperature-metric`, `test/e2e-telemetry-path` |
| P2 | `feature/arduino-actuators`, `feature/arduino-command-protocol`, `feature/edge-command-relay`, `feature/backend-actuator-command`, `feature/rule-engine`, `feature/device-status-api`, `feature/frontend-actuator-control`, **`feature/command-lifecycle`**, **`feature/edge-autonomy`**, **`feature/observability`** |
| P3 | `docs/ml-contract`, `feature/ml-dataset`, `feature/ai-server`, `feature/backend-ai-client`, `feature/edge-rf-fallback`, `feature/frontend-real-data`, `feature/environment-score-history` |
| P4 | `feature/fcm-push`, `chore/mobile-build`, `ci/github-actions`, `docs/demo-scenario`, `docs/fix-inconsistencies` |

---

## 5. 구조도와 코드의 남은 차이 (기록용)

| 구조도 | 실제 | 처리 |
|---|---|---|
| 센서 3종 | 광 센서(TSL2591) 필요 | **4종으로 확정** (D4) — 적합도 공식이 PPFD를 요구 |
| `edge/fusion_smartfarm_model.py`가 ML처럼 보임 | Autodesk Fusion 360 CAD 스크립트 | ML과 무관. 혼동 방지를 위해 파일명/위치 정리 검토 |
| Rule Engine이 Spring과 분리된 박스 | 별도 서비스 아님 | Spring 내부 컴포넌트로 구현 (P2-5) |

---

## 6. 검증 명령

```bash
# 백엔드
cd backend && ./gradlew test

# 프론트엔드
cd frontend/app && npx tsc --noEmit

# 엣지
cd edge/pi && python -m pytest
```

2026-08-04 기준 백엔드 52건 통과, 프론트 타입체크 통과.

---

## 7. AI 에이전트 작업 규칙

- 작업 전 `git branch --show-current` 확인. `develop`/`main`이면 즉시 작업 브랜치 생성 (`CLAUDE.md`)
- 동기화는 pull(머지) 금지. `git fetch upstream && git reset --hard upstream/develop`
- 커밋·push는 사용자가 요청했을 때만
- 대규모 탐색·구현은 codex에 위임 가능:
  `codex exec --sandbox <mode> --skip-git-repo-check --cd <repo> - < brief.md`
  (stdout에 세션 로그 전체가 섞이므로 최종 보고만 추출할 것)
- 모호한 사항은 추론하지 말고 사용자에게 질문한다

---

## 8. 아직 결정되지 않은 사항

**이미 확정된 것은 [§0 Decision Log](#0-확정된-결정-decision-log)에 있다. 여기에는 아직 답이 없는 것만 남긴다.**

1. **PPFD 보정 계수** — TSL2591 lux → PPFD 변환을 실측 보정으로 할지, 광원 종류별 문헌 계수를 쓸지.
   `backend/db/schema.sql`에 `lux_ppfd_validation` 관련 테이블이 이미 설계되어 있어 실측 경로가 전제된 것으로 보인다. (P1-5)
2. **관수 회귀 학습 데이터** — 실측 수집 / 공개 데이터셋 / 물리 모델 기반 합성 중 무엇인가.
   4주 안에 실측 데이터를 충분히 모으기는 어려울 수 있다. (P3-2)
3. **룰 정의 저장 방식** — 코드 하드코딩(빠름) vs DB 설정 테이블(사용자 조정 가능). (P2-5)
4. **AI 서버 배포 위치** — 백엔드와 같은 인스턴스 vs 별도 인스턴스. (P3-3)
5. **Orange Pi 하드웨어 사양** — RF 추론 런타임(scikit-learn 등)을 올릴 여유가 있는지. (P3-5)
6. **데모 시연 방식** — 실제 하드웨어 실물 시연인지 화면 위주인지. P1-9와 P4-4의 범위가 달라진다.

> 결정이 나면 이 절에서 지우고 §0 Decision Log에 D번호를 붙여 추가한다.
> 2026-08-04까지 D6·D8·D9·D10·D11·D13이 이 방식으로 해소됐다.
