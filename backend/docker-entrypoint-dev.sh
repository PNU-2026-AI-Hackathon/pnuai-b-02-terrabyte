#!/usr/bin/env bash
#
# 개발 컨테이너에서 Gradle Wrapper 를 실행하는 진입점.
# 인자는 그대로 gradlew 에 전달된다. 예)
#   docker compose up                    -> ./gradlew bootRun
#   docker compose run --rm backend test -> ./gradlew test
set -euo pipefail

GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"
export GRADLE_USER_HOME
mkdir -p "${GRADLE_USER_HOME}"

# backend/gradle.properties 는 개발자 로컬 전용 파일(.gitignore 대상)이라
# 호스트 경로(org.gradle.java.home=/opt/homebrew/...)가 들어 있을 수 있다.
# GRADLE_USER_HOME 의 gradle.properties 가 프로젝트 파일보다 우선하므로
# 여기서 컨테이너의 JDK 를 강제로 지정한다.
{
  echo "org.gradle.java.home=${JAVA_HOME}"
  echo "org.gradle.jvmargs=-Xmx1g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8"
} > "${GRADLE_USER_HOME}/gradle.properties"

# bind mount 된 gradlew 의 실행 권한이 빠져 있어도 동작하도록 sh 로 호출한다.
exec sh ./gradlew -Dorg.gradle.java.home="${JAVA_HOME}" "$@"
