# TerraByte 개발 인수인계

최종 갱신: 2026-07-23 (Asia/Seoul)

이 문서는 새 Codex 채팅에서 TerraByte 개발을 이어가기 위한 프로젝트 맥락이다. 새 채팅에서는 이 파일과
`backend/README.md`를 먼저 읽고, Git 상태를 다시 확인한 후 작업을 시작한다.

## 1. 프로젝트 개요

도심 유휴공간의 스마트팜 전환 가능성을 센서 데이터로 진단하는 서비스다. 하드웨어가 전송한 환경 측정값을
InfluxDB에 저장하고, 작물별 기준과 비교해 환경 적합도를 계산하여 프론트엔드 대시보드와 공간 진단 화면에 표시한다.

현재 백엔드는 Spring Boot/Gradle, 프론트엔드는 Expo React Native Web 기반이다.

### 주요 기술

- Backend: Java 17 이상, Spring Boot 3.5.16, Gradle 8.14.3
- Frontend: Expo, React Native Web, TypeScript
- PostgreSQL: 사용자, 기기, 공간 등 서비스 데이터
- SQLite: 작물별 환경 적합도 기준 프로필
- InfluxDB 2.x: 센서 시계열 데이터
- 인증: JWT Bearer Token

## 2. 저장소와 브랜치 규칙

### 원격 저장소

- `origin`: 개인 레포 `https://github.com/oesmln/pnuai-b-02-terrabyte.git`
- `upstream`: 공용 원본 레포 `https://github.com/PNU-2026-AI-Hackathon/pnuai-b-02-terrabyte.git`

### 기본 작업 규칙

사용자가 따로 말하지 않는 한 다음 규칙을 사용한다.

1. PR 대상은 공용 `upstream`이 아니라 개인 레포 `origin`의 `develop`이다.
2. 새 기능을 시작하기 전에 로컬 `develop`을 `origin/develop`과 동기화한다.
3. 최신 `develop`에서 기능 브랜치를 생성한다.
4. 기능 브랜치에 커밋하고 `origin`에 푸시한다.
5. `기능 브랜치 → 개인 레포 develop` 방향으로 PR을 만든다.
6. 사용자가 명시적으로 요청하지 않으면 `upstream`에는 PR이나 push를 하지 않는다.

권장 시작 명령:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/작업명
```

## 3. 현재 Git 상태

2026-07-23 확인 기준:

- 센서 수집 및 환경 적합도 PR #5가 개인 레포 `develop`에 병합됐다.
- 원격 `origin/develop` 최신 커밋은 `8dccf7a`다.
- 병합 커밋은 `3e4c220 feat: 센서 데이터 수집 및 환경 적합도 계산 연동 (#5)`이다.
- 현재 로컬 체크아웃은 `feature/measurement-api`다.
- 다음 작업 전 로컬 `develop`을 반드시 `origin/develop`과 동기화한다.
- 이 문서 작성 이후에는 실제 `git status`, `git fetch origin`, `git log`로 상태를 다시 확인한다.

## 4. 구현 완료 항목

### 백엔드 기반

- [x] Spring Boot Gradle 프로젝트 구성
- [x] PostgreSQL 기본 데이터소스 연결
- [x] SQLite 점수 전용 데이터소스 연결
- [x] Flyway 마이그레이션 구성
- [x] 공통 API 오류 응답 및 전역 예외 처리
- [x] Actuator 상태 확인
- [x] 테스트용 H2 및 인메모리 SQLite 설정

### 인증

- [x] `POST /api/auth/signup`
- [x] `POST /api/auth/login`
- [x] `GET /api/me`
- [x] 비밀번호 암호화
- [x] JWT 발급 및 Bearer 인증
- [x] 프론트엔드 로그인/회원가입 연동
- [x] 인증 API 통합 테스트

### 기기 및 공간 등록

- [x] `POST /api/devices`
- [x] 6자리 등록 코드 검증
- [x] 기기 중복 등록 방지
- [x] 기기 등록과 공간 정보 저장을 하나의 요청으로 처리
- [x] 공간명, 공간 유형, 면적 저장
- [x] 개발용 등록 코드 `483920`, `123456`
- [x] 등록 코드와 하드웨어 ID 연결
- [x] 프론트엔드 기기/공간 등록 연동
- [x] 기기 API 통합 테스트

### 센서 수집 및 InfluxDB

- [x] HTTP JSON 수집 방식 채택
- [x] `POST /api/telemetry`
- [x] `X-Device-Key` 검증
- [x] InfluxDB 센서 측정값 저장
- [x] 기기 상태와 마지막 수신 시각 갱신
- [x] `GET /api/devices/{deviceId}/measurements/latest`
- [x] `GET /api/devices/{deviceId}/measurements?metric=...&range=...`
- [x] 조회 기간 `1h`, `24h`, `7d`, `30d`
- [x] 측정 API 통합 테스트

지원 측정 항목:

- `air_temperature_c`
- `air_humidity_pct`
- `plant_light_ppfd_umol_m2_s`
- `soil_moisture_pct`
- `soil_moisture_raw_adc`

### 환경 적합도

- [x] SQLite 활성 작물 프로필 조회
- [x] 온도, 습도, PPFD 사다리꼴 점수 함수 구현
- [x] 항목별 `LOW`, `OK`, `HIGH` 판정 및 부족/초과량 계산
- [x] 세 항목의 기하평균으로 종합점수 계산
- [x] `GET /api/devices/{deviceId}/score`
- [x] 적합도 계산기 단위 테스트
- [x] 프론트엔드 대시보드와 공간 진단 화면 연동
- [x] 공통 적합도 계산식 팝업 구현

종합 적합도 공식:

```text
100 × (T/100)^(1/3) × (H/100)^(1/3) × (L/100)^(1/3)
= (T × H × L)^(1/3)
```

- `T`: 온도 점수
- `H`: 습도 점수
- `L`: PPFD 점수
- CO₂, 오염도, 토양수분은 종합점수에서 제외한다.
- 토양수분은 InfluxDB 저장 및 모니터링에만 사용한다.
- 조도 입력 단위는 lux가 아니라 PPFD(`μmol/m²/s`)로 가정한다.

## 5. 주요 데이터 계약

하드웨어 텔레메트리 예시는 `backend/README.md`의 로컬 통합 테스트 가이드를 참고한다.

중요 필드:

```json
{
  "schema_version": 1,
  "event_type": "telemetry.sample",
  "device_id": "orangepi-pro-01",
  "observed_at": "ISO-8601 UTC 시각",
  "sequence": 1042,
  "context": {
    "site_id": "pnu-lab",
    "zone_id": "pot-01",
    "soil_type": "loam",
    "crop_type": "basil",
    "calibration_version": "soil-v2"
  },
  "measurements": {
    "soil_moisture_pct": 31.2,
    "soil_moisture_raw_adc": 1847,
    "air_temperature_c": 27.1,
    "air_humidity_pct": 58.0,
    "plant_light_ppfd_umol_m2_s": 230.5
  },
  "quality": {
    "soil_sensor_valid": true,
    "air_sensor_valid": true,
    "light_sensor_valid": true
  }
}
```

등록 코드와 하드웨어 ID는 서로 다른 값이다.

- `483920` → `orangepi-pro-01`
- `123456` → `orangepi-pro-02`

## 6. 로컬 실행 및 테스트

상세 계정, 비밀번호, 토큰 및 Docker 실행 명령은 `backend/README.md`를 기준으로 한다. 아래 값은 모두 로컬 개발 전용이다.

### 서비스 주소

- Frontend: `http://localhost:8081`
- Backend: `http://localhost:8080`
- Backend health: `http://localhost:8080/actuator/health`
- InfluxDB UI: `http://localhost:8086`

### 테스트 사용자

- 이메일: `demo@terrabyte.local`
- 비밀번호: `password1`
- 기기 등록 코드: `483920`
- 하드웨어 ID: `orangepi-pro-01`

테스트 사용자는 현재 로컬 PostgreSQL에 만들어진 계정이며 Flyway로 자동 생성되지 않는다. 새 DB에서는 직접 회원가입한다.

### InfluxDB

- 사용자명: `terrabyte`
- 비밀번호: `terrabyte-admin-password`
- Organization: `terrabyte`
- Bucket: `telemetry`
- API Token: `terrabyte-local-token`
- 하드웨어 요청 키: `terrabyte-local-device-key`

위 자격정보는 운영 환경에서 절대 재사용하지 않는다.

### 실행

```bash
docker start terrabyte-influxdb

cd backend
./gradlew bootRun
```

별도 터미널:

```bash
cd frontend/app
npm install
npm run web
```

### 검증

```bash
cd backend
./gradlew test

cd ../frontend/app
npx tsc --noEmit
```

마지막 확인 결과:

- Backend Gradle tests: 성공
- Frontend TypeScript check: 성공
- `POST /api/telemetry`: `202 Accepted` 확인
- Frontend `http://localhost:8081`: HTTP 200 확인

## 7. 아직 구현되지 않은 핵심 기능

### 우선순위 1: 작물 선택

현재 점수 계산은 텔레메트리 JSON의 `context.crop_type`을 사용한다. 사용자가 선택한 작물을 PostgreSQL에 저장하고
그 작물을 기준으로 점수를 계산하는 흐름은 아직 없다.

- [ ] PostgreSQL 작물 마스터 테이블
- [ ] `GET /api/crops`
- [ ] 작물 검색 `GET /api/crops?q=...`
- [ ] `PATCH /api/devices/{deviceId}/crop`
- [ ] `/api/me`의 `hasCrop` 실제 계산
- [ ] 선택 작물과 SQLite 점수 프로필 연결
- [ ] 작물 API 통합 테스트
- [ ] 프론트엔드 작물 선택 화면 연동

추천 브랜치: `feature/crop-selection-api`

### 우선순위 2: 기기 상태

- [ ] `GET /api/devices/{deviceId}/status`
- [ ] 마지막 수신 시각 기반 ONLINE/OFFLINE 판정
- [ ] 일정 시간 미수신 시 OFFLINE 처리
- [ ] 설치 안내 화면의 상태 폴링 연동

추천 브랜치: `feature/device-status-api`

### 우선순위 3: 적합도 이력

- [ ] `GET /api/devices/{deviceId}/scores`
- [ ] 점수 결과 저장 또는 조회 시 계산 방식 결정
- [ ] 기간별 적합도 변화 조회
- [ ] 오래된 측정값으로 점수를 표시할 수 있는 최대 유효시간 결정
- [ ] 환경 점수 API 통합 테스트 보강

추천 브랜치: `feature/environment-score-history`

### 우선순위 4: 환경 추천

- [ ] `GET /api/devices/{deviceId}/recommendations`
- [ ] 대체 작물 예상 점수 비교
- [ ] 조도 부족 → 생장등 추천
- [ ] 온도 부족 → 히팅 패드 추천
- [ ] 흙/배합 추천 응답
- [ ] 추천 API 테스트
- [ ] 프론트엔드 추천 카드 실제 API 연동

추천 브랜치: `feature/environment-recommendations`

### 우선순위 5: 관수 랜덤포레스트

- [ ] ML 입력/출력 계약 확정
- [ ] 모델 실행 방식 결정(Java 직접 실행 또는 Python 서비스)
- [ ] 센서 데이터 입력 변환
- [ ] 랜덤포레스트 추론 연동
- [ ] 관수 편의성 추천 결과 추가
- [ ] 모델 테스트

추천 브랜치: `feature/irrigation-recommendation`

## 8. 기술 부채 및 운영 준비

- [ ] `device_id + sequence` 기반 중복 수집 방지
- [ ] 센서 값 범위 검증
- [ ] 공용 Device Key를 기기별 인증 방식으로 개선
- [ ] InfluxDB 보존 정책 설정
- [ ] 장기 시계열 다운샘플링
- [ ] InfluxDB 장애 시 재시도/임시 저장 정책
- [ ] PostgreSQL 및 InfluxDB Docker Compose 작성
- [ ] 개발/테스트/운영 프로필 분리
- [ ] Swagger/OpenAPI 문서
- [ ] GitHub Actions 테스트
- [ ] 운영 JWT 및 DB 비밀값을 GitHub Secrets로 분리
- [ ] HTTPS 및 운영 CORS 설정
- [ ] PostgreSQL/InfluxDB 백업 정책

## 9. 다음 채팅 시작 프롬프트

새 채팅의 첫 메시지로 아래 내용을 사용한다.

```text
TerraByte 프로젝트 개발을 이어갈 거야.
먼저 루트의 HANDOFF.md와 backend/README.md를 전부 읽고,
현재 Git 브랜치·작업 트리·origin/develop·최근 커밋을 확인해줘.
개인 레포 origin의 develop을 기준으로 작업하고 upstream에는 내가 따로 말하지 않는 한 변경하지 마.
현재 상황을 짧게 요약한 다음 develop을 최신화하고 feature/crop-selection-api 브랜치를 만들어
작물 목록 조회 및 작물 선택 API 작업을 시작하자.
```

## 10. 작업 시 주의사항

- 기존 SQLite 점수 스키마와 작물 프로필을 먼저 확인하고 임의로 구조를 바꾸지 않는다.
- 현재 합의된 광량 단위는 PPFD다. lux 변환을 임의로 추가하지 않는다.
- CO₂, 오염도, 토양수분을 종합 적합도에 임의로 포함하지 않는다.
- 프론트엔드는 DB에 직접 접근하지 않고 모든 데이터를 백엔드 REST API로 조회한다.
- 사용자의 기존 변경사항을 삭제하거나 덮어쓰지 않는다.
- Maven이 아니라 Gradle을 사용한다.
- 커밋 및 push는 사용자가 요청했을 때 수행한다.
