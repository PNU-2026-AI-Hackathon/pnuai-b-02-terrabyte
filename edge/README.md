# Fusion 360 스마트팜 프로토타입

`fusion_scripts/SmartFarmPrototype`는 실행 한 번으로 새 Fusion 디자인에 미니멀 가정용 스마트팜 조립체를 생성하는 Python 스크립트입니다. 기존에 열려 있던 디자인은 수정하지 않습니다.

## 생성되는 구성

- 430 × 280 mm 플랫폼, 미끄럼 방지 풋, 배선 채널
- 200 × 160 × 135 mm 배수형 화분과 재배 배지
- Arduino 규격 보드, 브레드보드, I/O 패널이 들어간 전자부품 트레이
- 온습도, 토양 수분, 광량, 물 수위 센서
- 전면에서 밀어 넣는 히팅패드 카세트와 양측 슬라이드 레일
- 키드 도킹 풋을 가진 후방 마스트형 LED 조명 모듈
- 측면 도킹 풋, 물통, 펌프, 매니폴드, 드리퍼가 포함된 관수 모듈

각 항목은 Fusion 브라우저에서 독립 컴포넌트로 분리되어 있고, 바디에도 용도를 나타내는 이름이 지정됩니다.

## 실행

1. Autodesk Fusion에서 **Utilities → Add-Ins → Scripts and Add-Ins**를 엽니다.
2. `+` 메뉴의 **Script or add-in from device**를 선택합니다.
3. 이 저장소의 `fusion_scripts/SmartFarmPrototype` 폴더를 지정합니다.
4. 목록에서 **SmartFarmPrototype**을 실행합니다.
5. 생성된 새 디자인을 확인한 뒤 필요하면 `.f3d`, STEP 등 원하는 형식으로 저장합니다.

## 빠른 수정

[`SmartFarmPrototype.py`](fusion_scripts/SmartFarmPrototype/SmartFarmPrototype.py) 상단 `CONFIG`에서 다음 값을 먼저 조정하면 됩니다.

- `platform`: 플랫폼 폭, 깊이, 높이
- `planter`: 화분 폭, 깊이, 높이, 벽/바닥 두께, 모서리 반경
- `exploded_view`: `True`로 바꾸면 세 탈부착 모듈을 도크 밖으로 이동한 분해도를 생성
- `create_new_document`: 기본값 `True` 권장
- `show_completion_dialog`: 완료 팝업 표시 여부

이 모델은 공간 구성과 체결 아이디어를 확인하기 위한 콘셉트입니다. 출력 전에 실제 부품 실측치, 공차, 체결 강도, 방수, 배수, 전기 절연, 히터 과열 방지와 식물-조명 거리를 다시 설계해야 합니다.

