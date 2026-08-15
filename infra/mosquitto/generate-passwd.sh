#!/usr/bin/env bash
# infra/mosquitto/passwd 파일을 재생성한다.
#
# 이 저장소에 커밋된 passwd 파일의 해시는 아래 명령으로 만든 "진짜" 해시다
# (조작하거나 손으로 지어낸 값이 아니다). 자격 증명을 바꾸거나 새 게이트웨이를
# 추가할 때는 이 스크립트를 고쳐서 다시 실행한다.
#
# 사용법:
#   cd infra/mosquitto && ./generate-passwd.sh
#
# 로컬 개발 전용 자격 증명이며 비밀로 취급하지 않는다(README.md 참고).
set -euo pipefail

cd "$(dirname "$0")"

rm -f passwd
touch passwd

docker run --rm -v "$(pwd)":/work -w /work eclipse-mosquitto:2 sh -c '
  mosquitto_passwd -b passwd terrabyte-backend    terrabyte-backend-local &&
  mosquitto_passwd -b passwd gw-orangepi-pro-01   gw-orangepi-pro-01-local &&
  mosquitto_passwd -b passwd gw-orangepi-pro-02   gw-orangepi-pro-02-local
'

chmod 0600 passwd
echo "infra/mosquitto/passwd 재생성 완료."
