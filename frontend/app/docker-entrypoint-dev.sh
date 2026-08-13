#!/usr/bin/env bash
#
# node_modules 볼륨이 package-lock.json 과 어긋나면 다시 설치한 뒤 명령을 실행한다.
set -euo pipefail

LOCK_FILE="package-lock.json"
MARKER="node_modules/.docker-lock-hash"

if [ -f "${LOCK_FILE}" ]; then
  LOCK_HASH="$(sha256sum "${LOCK_FILE}" | cut -d' ' -f1)"
  if [ ! -f "${MARKER}" ] || [ "$(cat "${MARKER}")" != "${LOCK_HASH}" ]; then
    echo "[entrypoint] package-lock.json 변경 감지 — npm ci 실행"
    npm ci
    echo "${LOCK_HASH}" > "${MARKER}"
  fi
fi

echo "[entrypoint] node $(node --version) / npm v$(npm --version)"
exec "$@"
