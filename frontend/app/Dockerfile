# syntax=docker/dockerfile:1.7
#
# 배포용 프론트엔드 이미지 (멀티 스테이지)
#   1) build   : Expo 웹 정적 번들 생성 (expo export)
#   2) runtime : nginx 로 정적 파일 서빙 + /api 를 백엔드로 프록시
ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM ${NODE_IMAGE} AS build

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    EXPO_NO_TELEMETRY=1 \
    LANG=C.UTF-8

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# 기본값은 빈 문자열 = 동일 출처(/api/...)로 요청 → nginx 가 백엔드로 프록시한다.
# 별도 도메인에 백엔드를 두는 경우 빌드 시 절대 URL 을 주입한다.
ARG EXPO_PUBLIC_API_BASE_URL=""
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}

RUN npx expo export --platform web --output-dir dist

FROM ${NGINX_IMAGE} AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# localhost 가 아니라 127.0.0.1 인 이유: 컨테이너 안에서 localhost 는 ::1 로
# 먼저 해석되는데 nginx 는 `listen 80;` 으로 IPv4 에만 바인딩한다. localhost 를
# 쓰면 서비스가 멀쩡한데도 헬스체크만 connection refused 로 실패한다.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1
