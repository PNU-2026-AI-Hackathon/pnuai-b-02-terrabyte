# TerraByte 개발 환경 단축 명령
# 사용법: make <target>   (도움말: make help)

COMPOSE      ?= docker compose
COMPOSE_PROD ?= docker compose -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: help init up up-d down down-v restart logs logs-backend logs-frontend ps \
        build rebuild versions test backend-sh frontend-sh psql influx-sh \
        storybook prod-up prod-down clean

help: ## 사용 가능한 명령 목록
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

init: ## .env 파일 생성 (없을 때만)
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")
	@echo ".env ready (edit values if needed)"

up: init ## 전체 스택 실행 (포그라운드, 로그 확인용)
	$(COMPOSE) up --build

up-d: init ## 전체 스택 백그라운드 실행
	$(COMPOSE) up -d --build

down: ## 스택 중지 (데이터 볼륨 유지)
	$(COMPOSE) down

down-v: ## 스택 중지 + 데이터 볼륨까지 삭제 (DB 초기화)
	$(COMPOSE) down -v

restart: ## 백엔드만 재시작 (코드 변경 반영)
	$(COMPOSE) restart backend

logs: ## 전체 로그 따라가기
	$(COMPOSE) logs -f

logs-backend: ## 백엔드 로그
	$(COMPOSE) logs -f backend

logs-frontend: ## 프론트엔드 로그
	$(COMPOSE) logs -f frontend

ps: ## 컨테이너 상태
	$(COMPOSE) ps

build: ## 이미지 빌드
	$(COMPOSE) build

rebuild: ## 캐시 없이 이미지 재빌드
	$(COMPOSE) build --no-cache

versions: ## 컨테이너에 고정된 툴체인 버전 출력
	@echo "--- backend ---"
	@$(COMPOSE) run --rm --no-deps --entrypoint sh backend -c 'java -version 2>&1; sh ./gradlew --no-daemon --version 2>/dev/null | grep -E "^Gradle|^JVM"'
	@echo "--- frontend ---"
	@$(COMPOSE) run --rm --no-deps --entrypoint sh frontend -c 'echo "node $$(node --version)"; echo "npm  v$$(npm --version)"; echo "npx  v$$(npx --version)"'
	@echo "--- infra ---"
	@$(COMPOSE) run --rm --no-deps --entrypoint sh postgres -c 'postgres --version'
	@$(COMPOSE) run --rm --no-deps --entrypoint sh influxdb -c 'influxd version'

test: ## 백엔드 테스트 실행 (외부 DB 불필요, H2 + in-memory SQLite)
	# 실행 중인 backend 컨테이너(bootRun)가 Gradle 홈과 프로젝트 .gradle 디렉터리의
	# 락을 잡고 있으므로, 일회성 실행은 두 경로를 모두 분리해야 스택을 내리지 않고도
	# 테스트할 수 있다. 두 경로 모두 backend-gradle-home 볼륨 안이라 캐시는 유지된다.
	$(COMPOSE) run --rm --no-deps -e GRADLE_USER_HOME=/home/dev/.gradle/one-shot backend \
		--project-cache-dir /home/dev/.gradle/one-shot-project test

backend-sh: ## 백엔드 컨테이너 셸
	$(COMPOSE) exec backend bash

frontend-sh: ## 프론트엔드 컨테이너 셸
	$(COMPOSE) exec frontend bash

psql: ## PostgreSQL 콘솔 접속
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-terrabyte} -d $${POSTGRES_DB:-terrabyte}

influx-sh: ## InfluxDB 컨테이너 셸
	$(COMPOSE) exec influxdb sh

storybook: ## Storybook 실행 (http://localhost:6006)
	$(COMPOSE) --profile storybook up storybook

prod-up: ## 배포용 스택 실행 (http://localhost:8088)
	$(COMPOSE_PROD) up -d --build

prod-down: ## 배포용 스택 중지
	$(COMPOSE_PROD) down

clean: ## 개발 스택 중지 + 볼륨·고아 컨테이너 정리
	$(COMPOSE) down -v --remove-orphans
