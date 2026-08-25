# Docker 개발·배포 환경 가이드

`docker compose` 한 번으로 **PostgreSQL · InfluxDB · Spring Boot 백엔드 · Expo 프론트엔드**를 모두 실행합니다.
호스트에 JDK, Gradle, Node.js, DB를 따로 설치하지 않아도 되고, 팀원 전원이 **같은 버전**으로 작업합니다.

## 1. 사전 준비

런타임은 아래 중 하나면 됩니다. 어느 쪽이든 **Compose v2 와 BuildKit(buildx)** 이 필요합니다.

| 런타임 | 준비 |
| --- | --- |
| Docker Desktop 4.x+ (macOS/Windows) | 설치만 하면 compose·buildx 가 함께 들어 있습니다 |
| OrbStack (macOS) | 설치만 하면 compose·buildx 가 함께 들어 있습니다 |
| Colima (macOS, CLI) | `brew install colima docker docker-compose docker-buildx` 후 아래 참고 |
| Docker Engine 24+ (Linux) | `docker-compose-plugin` · `docker-buildx-plugin` 패키지 설치 |

Colima 는 CLI 플러그인을 직접 연결해야 합니다(하지 않으면 legacy builder 로 떨어져
`--mount=type=cache` 를 쓰는 Dockerfile 빌드가 실패합니다):

```bash
mkdir -p ~/.docker/cli-plugins
ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
ln -sfn /opt/homebrew/opt/docker-buildx/bin/docker-buildx  ~/.docker/cli-plugins/docker-buildx
colima start --cpu 4 --memory 8 --disk 60
```

확인:

```bash
docker compose version   # v2.x 이상
docker buildx version    # 출력되어야 함
```

Linux 에서는 `.env` 의 `DOCKER_UID`/`DOCKER_GID` 를 `id -u`/`id -g` 값으로 맞춰 주세요.
macOS(Docker Desktop·OrbStack·Colima)는 기본값 그대로 두면 됩니다.

```bash
cp .env.example .env    # 또는 make init
```

`.env` 는 `.gitignore` 대상입니다. 기본값은 모두 **로컬 개발 전용**이며 배포 시 반드시 교체합니다.

## 2. 실행

```bash
make up          # 포그라운드 (로그를 그대로 확인)
make up-d        # 백그라운드
make ps          # 상태 확인
make down        # 중지 (데이터 유지)
make down-v      # 중지 + DB 볼륨 삭제 (완전 초기화)
```

`make` 없이 쓰려면 그대로 `docker compose up --build` 를 사용해도 됩니다.

| 서비스 | 주소 | 비고 |
| --- | --- | --- |
| 프론트엔드 (Expo Web) | http://localhost:8081 | Metro 개발 서버 |
| 백엔드 | http://localhost:8080 | `/actuator/health` 로 상태 확인 |
| 백엔드 원격 디버그 | `localhost:5005` | JDWP |
| PostgreSQL | `localhost:5432` | `terrabyte / terrabyte` |
| InfluxDB UI | http://localhost:8086 | `terrabyte / terrabyte-admin-password` |
| Storybook (선택) | http://localhost:6006 | `make storybook` |

첫 실행은 Gradle 의존성과 npm 패키지를 내려받느라 5~10분 정도 걸립니다. 두 번째부터는 볼륨 캐시를 재사용합니다.

## 3. 고정된 버전

버전은 전부 `.env` 한 곳에서 관리합니다. 실제 컨테이너에 들어간 값은 `make versions` 로 확인합니다.

| 대상 | 고정 위치 | 값 |
| --- | --- | --- |
| JDK (빌드·실행) | `.env` → `JAVA_IMAGE` | `eclipse-temurin:21-jdk-jammy` |
| JRE (배포 런타임) | `.env` → `JAVA_RUNTIME_IMAGE` | `eclipse-temurin:21-jre-jammy` |
| Gradle | `backend/gradle/wrapper/gradle-wrapper.properties` | 8.14.3 (Wrapper) |
| Node.js / npm / npx | `.env` → `NODE_IMAGE` | `node:24-bookworm-slim` |
| PostgreSQL | `.env` → `POSTGRES_IMAGE` | `postgres:17-alpine` |
| InfluxDB | `.env` → `INFLUXDB_IMAGE` | `influxdb:2.7` |
| nginx (배포용) | `.env` → `NGINX_IMAGE` | `nginx:1.27-alpine` |

메모:

- **npm / npx** 는 별도로 설치하지 않습니다. Node 이미지 태그 하나가 `node`·`npm`·`npx` 조합을 함께 고정하며,
  npx 는 npm 에 포함되어 배포되므로 항상 npm 과 같은 버전입니다.
- **Java 21** 을 쓰지만 컴파일 타깃은 `build.gradle` 의 `sourceCompatibility = 17` 그대로입니다.
  (Gradle 8.14.3 은 JDK 26 을 아직 지원하지 않으므로 호스트의 최신 JDK 대신 컨테이너의 21을 사용합니다.)
- 완전히 재현 가능한 빌드가 필요하면 태그 대신 다이제스트로 고정합니다.
  ```bash
  docker buildx imagetools inspect eclipse-temurin:21-jdk-jammy --format '{{.Manifest.Digest}}'
  # .env: JAVA_IMAGE=eclipse-temurin:21-jdk-jammy@sha256:...
  ```

## 4. 개발 워크플로우

### 백엔드

소스는 `./backend` 를 컨테이너에 bind mount 하므로 호스트에서 코드를 수정하면 그대로 반영됩니다.
빌드 산출물(`build/`, `.gradle/`)은 컨테이너 전용 볼륨으로 분리되어 호스트의 macOS 빌드 결과와 섞이지 않습니다.

```bash
# 코드 수정 후 반영
make restart               # = docker compose restart backend

# 테스트 (외부 DB 불필요: H2 + in-memory SQLite)
make test                  # = docker compose run --rm --no-deps backend test

# 임의의 Gradle 태스크
docker compose run --rm --no-deps backend build -x test
docker compose run --rm --no-deps backend dependencies

# 컨테이너 셸
make backend-sh
```

컨테이너 진입점은 `backend/docker-entrypoint-dev.sh` 이며 인자를 그대로 `./gradlew` 에 전달합니다.
개발자 로컬 전용 파일인 `backend/gradle.properties`(호스트 JDK 경로가 들어 있음)는 컨테이너 안에서
자동으로 무시되고, 컨테이너의 `JAVA_HOME` 이 사용됩니다.

### 원격 디버깅 (IntelliJ / VS Code)

백엔드는 항상 `5005` 포트에서 JDWP 를 대기합니다(`suspend=n` 이므로 디버거를 붙이지 않아도 정상 기동).

- **IntelliJ IDEA**: Run → Edit Configurations → `+` → *Remote JVM Debug* → Host `localhost`, Port `5005` → Debug
- **VS Code** (`.vscode/launch.json`):
  ```json
  {
    "type": "java",
    "name": "Attach to Docker backend",
    "request": "attach",
    "hostName": "localhost",
    "port": 5005,
    "projectName": "backend"
  }
  ```

브레이크포인트를 건 뒤 `http://localhost:8080/...` 로 요청하면 그대로 멈춥니다.

### 프론트엔드

Metro 가 파일 변경을 감지해 자동 새로고침합니다(컨테이너 bind mount 대응으로 폴링을 켜 둠).

```bash
make logs-frontend
make frontend-sh
docker compose exec frontend npx tsc --noEmit    # 타입 체크
make storybook                                    # http://localhost:6006
```

`package.json` / `package-lock.json` 을 바꾼 경우 컨테이너를 재시작하면 진입점이 해시 변화를 감지해
`npm ci` 를 자동 실행합니다.

```bash
docker compose restart frontend
```

**실제 휴대폰(Expo Go)에서 붙을 때**는 `localhost` 로 접근할 수 없으므로 `.env` 를 수정합니다.

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:8080   # 개발 PC 내부 IP
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.0.10
```

iOS 시뮬레이터·Android 에뮬레이터 실행(`expo run:ios`, `expo run:android`)은 네이티브 SDK가 필요해
컨테이너에서 지원되지 않습니다. 이 경우에만 호스트에서 `cd frontend/app && npm run ios` 를 사용하고,
백엔드·DB 는 그대로 Docker 를 쓰면 됩니다.

### DB 접속

```bash
make psql                                     # PostgreSQL 콘솔
docker compose exec postgres pg_dump -U terrabyte terrabyte > backup.sql
```

- PostgreSQL 스키마는 백엔드 기동 시 **Flyway** 가 `V1~V19` 마이그레이션을 자동 적용합니다.
- SQLite 점수 DB는 `SqliteSchemaInitializer` 가 빈 파일에 전체 스키마를 생성하고, 지원되는 기존 스키마에는 마이그레이션을 적용합니다. 과거 bootstrap DB(기본 3개 테이블만 존재)는 데이터 손실 없이 전체 스키마로 보완합니다. 그 밖의 불완전한 파일은 데이터 손실을 막기 위해 기동을 중단하므로, 파일을 백업한 뒤 복구하거나 빈 파일로 교체해야 합니다.
- InfluxDB 는 최초 기동 시 org/bucket/토큰이 자동 설정됩니다(`DOCKER_INFLUXDB_INIT_*`).

DB를 완전히 초기화하려면 `make down-v` 후 다시 `make up`.

### 센서 데이터 테스트 전송

```bash
observed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
curl -X POST http://localhost:8080/api/telemetry \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Key: terrabyte-local-device-key' \
  -d "{\"schema_version\":1,\"event_type\":\"telemetry.sample\",\"device_id\":\"orangepi-pro-01\",\"observed_at\":\"$observed_at\",\"sequence\":1042,\"measurements\":{\"soil_moisture_pct\":31.2,\"air_temperature_c\":27.1,\"air_humidity_pct\":58.0,\"plant_light_ppfd_umol_m2_s\":230.5}}"
```

자세한 페이로드 예시는 `backend/README.md` 를 참고하세요.

## 5. 배포용 스택

```bash
make prod-up      # docker compose -f docker-compose.prod.yml up -d --build
# http://localhost:8088
make prod-down
```

개발 스택과 다른 점:

- 백엔드는 `bootJar` 로 빌드한 이미지를 JRE 런타임에서 실행합니다(소스 mount 없음, non-root 사용자).
- 프론트엔드는 `expo export` 로 만든 정적 번들을 nginx 가 서빙하고, `/api` 는 백엔드로 프록시합니다.
  → 브라우저 입장에서 동일 출처이므로 CORS 설정이 필요 없습니다.
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `INFLUX_TOKEN`, `TELEMETRY_DEVICE_KEY` 는 **필수**이며
  비어 있으면 compose 가 실행을 거부합니다.

## 6. 문제 해결

| 증상 | 해결 |
| --- | --- |
| `port is already allocated` | 호스트에서 같은 포트를 쓰는 프로세스 종료, 또는 `.env` 의 `*_PORT` 변경 (호스트에 PostgreSQL 이 이미 떠 있으면 `POSTGRES_PORT` 를 바꾸세요) |
| `the --mount option requires BuildKit` | buildx 플러그인이 없습니다. 위 1절의 Colima/Linux 준비 절차 참고 |
| `npm ci` 가 `Missing: ... from lock file` 로 실패 | `package-lock.json` 이 npm 11+ 로 생성돼 있습니다. `NODE_IMAGE` 를 npm 11 이상 포함 이미지(`node:24-bookworm-slim`)로 유지하세요 |
| 백엔드가 Flyway 오류로 죽음 | `make down-v` 로 DB 초기화 후 재실행 |
| 프론트엔드가 `Cannot find module` | `docker compose restart frontend` (진입점이 `npm ci` 재실행) |
| 파일 변경이 반영되지 않음 | `make restart`(백엔드) / `docker compose restart frontend` |
| Gradle 이 호스트 JDK 경로를 찾음 | 진입점이 덮어쓰므로 발생하지 않아야 함. 그래도 나면 `make rebuild` |
| Linux 에서 bind mount 파일이 root 소유 | `.env` 의 `DOCKER_UID`/`DOCKER_GID` 를 `id -u`/`id -g` 값으로 변경 후 `make rebuild` |
| 첫 빌드가 너무 느림 | 정상입니다. 이후 `backend-gradle-home`, `frontend-node-modules` 볼륨이 캐시로 동작합니다 |

컨테이너·볼륨을 전부 정리하려면:

```bash
make clean
```
