# syntax=docker/dockerfile:1.7
#
# 배포용 백엔드 이미지 (멀티 스테이지)
#   1) build   : 고정된 JDK + Gradle Wrapper 로 bootJar 생성
#   2) runtime : JRE 만 포함한 최소 이미지에서 jar 실행
ARG JAVA_IMAGE=eclipse-temurin:21-jdk-jammy
ARG JAVA_RUNTIME_IMAGE=eclipse-temurin:21-jre-jammy

FROM ${JAVA_IMAGE} AS build

WORKDIR /build
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# 1) Wrapper 와 빌드 스크립트를 먼저 복사해 의존성 레이어를 캐시한다.
COPY gradlew ./
COPY gradle ./gradle
COPY settings.gradle build.gradle ./
RUN --mount=type=cache,target=/root/.gradle \
    sh ./gradlew --no-daemon --version

# 2) 소스 복사 후 테스트 없이 실행 가능한 jar 생성 (테스트는 CI/개발 스택에서 수행)
COPY db ./db
COPY src ./src
RUN --mount=type=cache,target=/root/.gradle \
    sh ./gradlew --no-daemon clean bootJar -x test \
 && cp build/libs/*.jar /build/app.jar

FROM ${JAVA_RUNTIME_IMAGE} AS runtime

ARG UID=10001
ARG GID=10001

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    JAVA_OPTS="-XX:MaxRAMPercentage=75.0" \
    SERVER_PORT=8080 \
    SQLITE_URL=jdbc:sqlite:/app/data/terrabyte-score.db

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl tini; \
    rm -rf /var/lib/apt/lists/*; \
    groupadd -g "${GID}" app; \
    useradd -M -u "${UID}" -g "${GID}" -d /app -s /usr/sbin/nologin app; \
    mkdir -p /app/data; \
    chown -R "${UID}:${GID}" /app

WORKDIR /app
COPY --from=build --chown=${UID}:${GID} /build/app.jar /app/app.jar

USER ${UID}:${GID}
VOLUME ["/app/data"]
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=10 \
    CMD curl -fsS "http://localhost:${SERVER_PORT}/actuator/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "sh", "-c", "exec java ${JAVA_OPTS} -jar /app/app.jar"]
