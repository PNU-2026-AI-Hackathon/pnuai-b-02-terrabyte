# TerraByte Orange Pi telemetry bridge

이 프로그램은 Arduino의 USB serial JSON Lines를 검증하고 수신 시각을 UTC로
기록한 뒤 SQLite outbox에 먼저 저장합니다. 백엔드가 끊겨도 데이터가 남으며,
연결이 복구되면 순서대로 재전송합니다.

## 통신 계약

### Arduino → Orange Pi (serial JSON Lines)

`115200 baud`에서 한 줄에 JSON 객체 하나와 `\n`을 보냅니다. 필수 측정값 세 개가
모두 유효할 때만 `telemetry`를 내보냅니다.

```json
{"message_type":"telemetry","protocol_version":1,"node_id":"terrabyte-node-001","sequence":42,"uptime_ms":123456,"air_temperature_c":24.5,"relative_humidity_pct":61.2,"ppfd_umol_m2_s":382.0,"illuminance_lux":14000.0,"soil_temperature_c":18.5,"soil_moisture_pct":52.0}
```

`soil_temperature_c`와 `soil_moisture_pct`는 해당 프로브를 컴파일했을 때만
나옵니다. **없으면 필드가 통째로 빠지며 0으로 채우지 않습니다** — 관수 판단에
"확신에 찬 완전 건조"로 도달하면 안 되기 때문입니다.

`hello`와 `sensor_status`는 상태 확인용으로 기록만 하고 전송하지 않습니다.
범위를 벗어나면 클램프하지 않고 폐기합니다. `sequence`·`uptime_ms`는 재부팅 시
0부터 다시 시작하고 uint32로 wrap되므로 영구 식별자로 쓰지 않습니다. Orange Pi가
수신 건마다 UUID를 부여하며, 이 UUID와 수신 UTC 시각은 재전송 중에도 바뀌지
않습니다.

### Orange Pi → 백엔드 (MQTT, telemetry envelope v2)

운영 전송은 MQTT입니다. 계약 원본은
[`docs/design/device_model_and_telemetry_contract.md`](../../docs/design/device_model_and_telemetry_contract.md) §6입니다.

```text
tb/v2/{gatewayId}/up/telemetry    게이트웨이 → 서버   QoS 1, retain 안 함
tb/v2/{gatewayId}/up/status       온라인 상태, LWT     QoS 1, retain
tb/v2/{gatewayId}/dn/command      서버 → 게이트웨이     QoS 1
```

**인증은 브로커가 담당합니다.** 각 게이트웨이 계정은 자기 `gatewayId` 아래에만
발행할 수 있어(Mosquitto ACL) 토픽 위조가 불가능하고, 그래서 백엔드는 토픽에서
뽑은 `gatewayId`를 신뢰합니다. 공용 `X-Device-Key`는 이 구조로 대체되어
삭제됐습니다.

접속 시 `up/status`에 `{"online": true}`를 retain 발행하고, LWT로
`{"online": false}`를 등록합니다. 연결이 끊기면 브로커가 대신 발행하므로 서버는
오프라인 판정을 위해 폴링하지 않습니다. **명령(`dn/command`)은 절대 retain하지
않습니다** — retain하면 재접속 때마다 오래된 관수 명령이 재실행됩니다.

전달 판정은 PUBACK 기준입니다. MQTT에는 HTTP 4xx에 해당하는 응답이 없어
"영구히 잘못된 페이로드"와 "일시적 장애"를 구분할 수 없으므로, `dead` 격리는
브로커에 닿기 전 **로컬 스키마 검증 실패에만** 적용합니다. 나머지는 전부 재시도이며
outbox가 순서를 보존합니다.

MQTT v5를 씁니다. 3.1.1에서는 브로커가 ACL로 막은 발행에도 PUBACK을 돌려주기
때문에, 게이트웨이가 자기 네임스페이스 밖으로 발행하도록 잘못 설정되면 성공으로
보고되고 outbox에서 지워져 데이터가 조용히 사라집니다. v5의 PUBACK reason code로
이를 감지해 재시도로 처리합니다.

### HTTP 폴백

`TB_TRANSPORT=http`로 바꾸면 같은 envelope을 `POST /api/telemetry`(성공 `202`)로
보냅니다. 디버그·폴백 경로이며 백엔드에서 기본 비활성입니다
(`app.telemetry.http-ingest.enabled`).

## Orange Pi 설치

Python 3.10 이상을 권장합니다. 먼저 실제 USB 식별자를 확인합니다.

```bash
ls -l /dev/serial/by-id/
```

`/dev/ttyACM0`나 `/dev/ttyUSB0`는 재부팅 또는 재연결 때 번호가 바뀔 수
있으므로 환경 설정에는 `/dev/serial/by-id/...` 경로를 사용하세요.
`capturedAtUtc`는 Orange Pi의 수신 시각이므로 `timedatectl status`에서 NTP
동기화가 활성 상태인지도 확인해야 합니다.

프로젝트의 `edge/pi` 내용을 `/opt/terrabyte-edge`에 배치했다고 가정하면:

```bash
cd /opt/terrabyte-edge
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

다음 배포 파일을 복사해 값들을 수정합니다.

```bash
sudo cp deploy/terrabyte-edge.env.example /etc/terrabyte-edge.env
sudo cp deploy/terrabyte-edge.service /etc/systemd/system/
sudo useradd --system --home /var/lib/terrabyte-edge --shell /usr/sbin/nologin terrabyte-edge
sudo usermod -aG dialout terrabyte-edge
sudo install -o root -g terrabyte-edge -m 0640 /dev/null /etc/terrabyte-edge.token
sudoedit /etc/terrabyte-edge.token
sudoedit /etc/terrabyte-edge.env
sudo systemctl daemon-reload
sudo systemctl enable --now terrabyte-edge
```

보드 이미지에서 serial 장치의 그룹이 `dialout`이 아니면 `stat -c '%G'
/dev/serial/by-id/...`로 확인하고 unit의 `SupplementaryGroups`를 바꿉니다.

상태와 로그는 다음처럼 확인합니다. 토큰과 원문 센서 JSON은 로그에 남기지
않습니다.

```bash
systemctl status terrabyte-edge
journalctl -u terrabyte-edge -f
```

## 로컬 상태 대시보드

브리지는 `/run/terrabyte-edge/status.json`을 최대 1초 간격으로 원자적으로
갱신합니다. 이 파일은 자격 증명을 포함하지 않으며 별도 데스크톱 프로세스가
읽을 수 있도록 `0644` 권한으로 생성됩니다. 대시보드는 시리얼 포트나 네트워크를
직접 열지 않으므로 화면 장애가 텔레메트리 수집에 영향을 주지 않습니다.

```bash
# 개발용 창 모드
.venv/bin/python -m terrabyte_edge dashboard --windowed

# Orange Pi 데스크톱 자동 시작
mkdir -p ~/.config/autostart
cp deploy/terrabyte-dashboard.desktop ~/.config/autostart/
```

### 브라우저 상태판 (`status`)

같은 내용을 HTTP로도 서빙합니다. GUI 툴킷은 게이트웨이가 의존할 수 있는 것 중
가장 이식성이 낮습니다 — Apple이 제공하는 Tk는 8.5이고 최신 macOS에서 흰 창만
그리며, 리눅스는 이미지마다 tk 패키지 설치 여부가 다릅니다. 브라우저는 운영자가
쓰는 모든 기기에 있고, 화분 옆에 서 있을 때 손에 든 휴대폰에도 있습니다.

```bash
# 기본 127.0.0.1:8090
.venv/bin/python -m terrabyte_edge status

# 다른 기기에서 보려면 호스트를 명시한다. 읽기 전용이지만 인증이 없고 화분
# 이름과 마지막 수신 시각이 드러나므로, 노출은 기본값이 아니라 선택이다.
.venv/bin/python -m terrabyte_edge status --host 0.0.0.0

# 브라우저조차 없는 SSH 세션에서는 같은 뷰를 텍스트로
.venv/bin/python -m terrabyte_edge status --text
.venv/bin/python -m terrabyte_edge status --text --watch 2
```

경로는 셋뿐입니다. `/`는 2초마다 스스로 새로고침하는 보드,
`/status.json`은 같은 뷰의 JSON(프로브나 두 번째 화면용 — 원시 스냅샷이 아니라
렌더된 뷰라서 소비자가 화면과 어긋나지 않습니다), `/healthz`는 감시용입니다.

부팅 시 자동 실행은 브릿지와 **별도 유닛**으로 겁니다. 상태판 재시작이
텔레메트리를 끊어서는 안 되고, SSH로만 보는 헤드리스 게이트웨이에서는 상태판
자체가 선택 사항이기 때문입니다.

```bash
sudo cp deploy/terrabyte-status.service /etc/systemd/system/
sudo systemctl enable --now terrabyte-status
```

전체화면에서는 `Escape` 또는 `q`로 종료할 수 있습니다. 상태 파일이 없거나 8초
이상 갱신되지 않으면 기존 값을 정상처럼 표시하지 않고 오류 배너를 표시하며,
연결되지 않은 선택 센서 값은 `—`로 표시합니다. 기본 명령
`python -m terrabyte_edge`는 이전과 동일하게 브리지를 실행합니다.

## 설정

필수 환경 변수는 `TB_SERIAL_PORT`, `TB_BACKEND_BASE_URL`,
`TB_CROP_CONTEXT_ID`, `TB_DEVICE_ID`, `TB_EXPECTED_NODE_ID`와 인증 토큰입니다.
serial의 `node_id`가 `TB_EXPECTED_NODE_ID`와 다르면 관측을 저장하지 않습니다.
토큰은
`TB_DEVICE_TOKEN_FILE`을 권장하며, 개발할 때만 `TB_DEVICE_TOKEN`을 직접
사용할 수 있습니다. 둘을 동시에 설정하면 시작을 거부합니다. 전체 기본값은
[`deploy/terrabyte-edge.env.example`](deploy/terrabyte-edge.env.example)에
있습니다.

SQLite 파일은 기본 `/var/lib/terrabyte-edge/outbox.sqlite3`입니다. 영구 실패
레코드는 현장 진단을 위해 삭제하지 않습니다. 각 이벤트가 수집 당시의 crop
context를 함께 저장하므로 context 변경 뒤 재전송해도 과거 관측의 귀속이
바뀌지 않습니다. `TB_OUTBOX_MAX_ROWS`에 도달하면 디스크를 무한히 채우는 대신
새 관측을 버리고 `CRITICAL` 로그를 남기므로, 운영 모니터링에서 이 로그와
pending/dead row 수를 경보로 연결해야 합니다.

운영에서는 HTTPS가 기본이며 개발용 HTTP는 `TB_ALLOW_INSECURE_HTTP=true`를
명시해야만 허용됩니다. Orange Pi 시각이 `TB_CLOCK_MINIMUM_UTC`보다 이르면 NTP가
동기화되지 않은 것으로 보고 관측을 폐기합니다.

## 관수 판정 (`terrabyte_edge/irrigation`)

지금 관수할지 말지를 판정합니다. 관수량은 **30 mL 고정**이며, 이 모듈은 "얼마나"를
결정하지 않습니다.

판정은 두 단계이고 **순서가 안전성의 근거**입니다.

1. **안전 봉투(safety envelope)** — 결정론적 규칙. 센서 유효성, 측정 신선도(10분),
   건조 게이트, 최소 간격, 일일 예산. 하나라도 걸리면 즉시 거부하고 **모델은 호출되지
   않습니다.**
2. **랜덤 포레스트** — 봉투를 통과한 경우에만 판정. 봉투가 먼저·독립적으로 평가되므로
   모델은 관수를 **억제만 할 수 있고 결정론적 규칙이 허용한 범위를 넓힐 수 없습니다**
   (`D17`).

프로필 두 가지: `EnvelopeLimits.supervised()`(기본, 건조 게이트 45%·최소 간격 6시간)와
클라우드 장애용 `EnvelopeLimits.autonomous()`(`D16` 기준, 15%·12시간).

모델 아티팩트가 없거나 스키마가 어긋나면 `ModelError`가 발생하고, 판정은
`MODEL_UNAVAILABLE`로 **관수하지 않는 쪽**으로 떨어집니다.

### 런타임 의존성 없음

포레스트는 오프라인에서 scikit-learn으로 학습한 뒤 순수 배열 JSON으로 내보냅니다.
추론기(`forest.py`)는 numpy도 scikit-learn도 import하지 않으므로 Orange Pi의 의존성은
`pyserial` 하나로 유지됩니다. 25트리·깊이 7 기준 아티팩트 273 KiB, 로드 7.6 ms,
판정 0.013 ms(개발 PC 실측).

### 데이터 수집 (`edge/arduino` dataset_logger + `tools/capture_dataset.py`)

`src/dataset_logger.cpp`는 **배포 펌웨어가 아닙니다.** JSON Lines 계약 대신 CSV를
내보내고, 시리얼 명령을 받고, 액추에이터 인터록이 전혀 없습니다. PlatformIO의 기본
환경에서 제외되어 있어 명시적으로만 빌드됩니다.

```bash
cd edge/arduino && pio run -e dataset_logger -t upload

cd edge/pi
python tools/capture_dataset.py --port /dev/ttyUSB0 --output data/raw/pot-01.csv
```

물을 줄 때마다 stdin에 `w30`(30 mL)을 입력하십시오. **이 관수 이벤트가 라벨의
유일한 출처이며**, 없으면 캡처는 그냥 센서 기록일 뿐입니다. Arduino에 RTC가 없어
벽시계 시각은 호스트가 붙입니다.

### 가짜 캡처 (실측 데이터 확보 전까지)

```bash
python tools/make_bench_capture.py --pots 4 --days 45
```

`data/`는 git-ignored이고 생성 파일 첫 줄에 `# SYNTHETIC` 배너가 박힙니다.
**측정값이 아니므로 수집한 데이터로 보고하면 안 됩니다.** 화분마다 배지 건조 속도,
흡수율, 관수 임계값, 사용자 습관, 광주기를 다르게 뽑습니다.

### 재학습

```bash
python -m venv .venv
.venv/bin/pip install -r tools/requirements-train.txt
.venv/bin/python tools/train_irrigation_rf.py                    # CPU
.venv/bin/python tools/train_irrigation_rf.py --backend xgboost --device cuda
```

`data/raw/*.csv`를 자동으로 읽습니다. 라벨은 **"운영자가 6시간 안에 물을 줬는가"**로,
공식이 아니라 사람의 결정입니다. 캡처가 하나도 없으면 물수지 생성기로 폴백하는데,
그 경우 **라벨이 곧 공식이라 포레스트는 넘겨받은 방정식을 재발견할 뿐**이며 경고를
출력합니다.

평가 분할은 절대 무작위가 아닙니다. 1분 간격 행은 서로 거의 같은 값이라 셔플하면
이웃 행이 반대편에 들어가 배포에서 재현 불가능한 정확도가 나옵니다. 화분이 여러 개면
**마지막 화분을 통째로 홀드아웃**하고, 하나뿐이면 시간순 75/25로 자릅니다.

백엔드 두 가지 모두 동일한 순수 파이썬 아티팩트를 내보내므로 Orange Pi 런타임은
어느 쪽으로 학습했든 달라지지 않습니다.

- `sklearn` (기본, CPU) — 리프가 확률, `aggregation: mean_probability`
- `xgboost` (`--device cuda`로 NVIDIA GPU) — 리프가 raw margin,
  `aggregation: sum_logit`. RAPIDS cuML 대신 고른 이유는 Windows 네이티브 pip로
  설치되기 때문입니다(cuML은 WSL2 필요).

내보내기 단계는 학습 표본을 런타임 추론기로 재채점해 학습기와 확률이 일치하는지
검사하고, 불일치하면 아티팩트를 쓰지 않습니다(train/serve skew 차단).

## 테스트

테스트에는 외부 서버, serial 장치, pyserial이 필요하지 않습니다.

```bash
cd edge/pi
python -m unittest discover -s tests -v
```
