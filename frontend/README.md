# Frontend


## 폴더 구조

```text
frontend/
└─ app/                         # Expo React Native 앱 루트
  ├─ App.tsx                    # 앱 전체 흐름을 묶는 최상위 컴포넌트
  ├─ src/                       # 실제 화면과 기능 코드
    ├─ appTheme/                # 색상, 글꼴, 스타일 토큰
    ├─ auth/                    # 로그인/세션 API
    ├─ components/              # 재사용 UI 컴포넌트
    ├─ crop/                    # 작물 관련 API
    ├─ device/                  # 기기 관련 API
    ├─ measurement/             # 환경 측정 API
    ├─ navigation/              # 화면 이동과 레이아웃
    ├─ onboarding/              # 로그인 및 초기 설정 화면
    ├─ screens/                 # 실제 서비스 화면
    ├─ shared/                  # 공용 훅/가공 로직
    └─ soil/                    # 토양 추천 API
  └─ package.json               
└─ README.md
```

## 실행 방법

### Docker 로 실행 (권장)

저장소 루트에서 아래 한 줄이면 백엔드·DB 와 함께 Expo 웹 개발 서버(http://localhost:8081)가 뜹니다.
Node.js/npm 버전은 컨테이너에 고정되어 있어 별도 설치가 필요 없습니다.

```bash
cp .env.example .env
docker compose up --build
```

iOS 시뮬레이터·Android 에뮬레이터 실행은 네이티브 SDK 가 필요해 컨테이너에서 지원되지 않으므로
아래의 호스트 실행 방법을 사용합니다. 자세한 내용은
[`docs/docker_dev_environment.md`](../docs/docker_dev_environment.md) 를 참고하세요.

### 사전 준비

처음 받았거나 `node_modules`가 없으면 먼저 의존성을 설치합니다.

```powershell
cd frontend/app
npm install
```

## 실행

Expo 개발 서버 실행:

```powershell
cd frontend/app
npx expo start
```

웹 브라우저로 실행:

```powershell
cd frontend/app
npm run web
```

Android 실행:

```powershell
cd frontend/app
npm run android
```

iOS 실행:

```powershell
cd frontend/app
npm run ios
```

## 목데이터 현황

아래는 **일반 앱 화면에 실제로 표시되는 정적 데이터**와 미사용 데이터를 구분한 현황입니다. `API 실패 시 표시되는 기본값`도 목데이터로 분류했습니다.

### 일반 앱에서 표시되는 정적 데이터

| 화면/흐름 | 표시되는 정적 데이터 | 위치 | 실제 API 연동 범위·비고 |
| --- | --- | --- | --- |
| 대시보드 | 차트 지표명·색상(`dashboardChartMetrics`), 선택 작물 API 값이 없을 때의 작물명 코드표(`crops`) | `app/src/data.ts`, `app/src/screens/dashboard/DashboardScreen.tsx` | 공간·기기 연결 상태는 기기 API 응답, 키트 상태는 센서 상태 API, 환경 점수 API factor(온도·습도·조도·토양 수분·토양 온도)와 최신 측정값·5개 시계열은 API |
| 공간 진단 | Gemini가 미설정이거나 호출에 실패했을 때만 개선 방안 3개, 7일 일정 4개, 예상 변화의 기본 문구를 표시. 선택 작물명은 정적 `crops` 코드표로 변환 | `app/src/screens/analysis/AnalysisScreen.tsx`, `app/src/care/carePlanApi.ts`, `app/src/data.ts` | 보고서 공간명은 기기 API의 연결 공간 응답, 환경 점수 API factor(온도·습도·조도·토양 수분·토양 온도)와 최신 측정값·토양 추천·대체 작물 추천은 API. Gemini 관리 계획 API가 개선 방안·7일 일정·예상 변화를 생성 |
| 실시간 모니터링 | 지표명·단위·색상·표시 구간(`liveMetricDefinitions`) | `app/src/data.ts` | 현재값, 최저·최고값, 5개 시계열은 API. 정적 값 데이터는 없음 |
| 관리 가이드 | Gemini가 미설정이거나 호출에 실패했을 때만 오늘 작업(`managementTasks`), 재배 단계 기준(`cultivationCriteria`), 추천 상품(`shopProducts`)과 환경 요인→상품 ID 매핑(`factorProductMap`)을 기본값으로 표시 | `app/src/data.ts`, `app/src/care/carePlanApi.ts`, `app/src/shared/factorPresentation.ts` | Gemini 관리 계획 API가 오늘 할 일·재배 기준·실제 판매 상품 기반 추천을 생성. 토양 배합 추천과 환경 점수는 API이며, 작업 완료 체크는 화면 메모리 상태 |
| 상품 구매 | 장바구니 품목별 수량, 열림 상태, 선택 상품, 페이지·필터 상태 | `app/src/screens/shop/ShopScreen.tsx` | 상품 목록·가격·카테고리·추천 배지는 `GET /api/products` 사용. 일반 앱에서 `shopProducts`를 상품 목록으로 사용하지 않음 |
| 기기 등록·화분 관리·사이드바 | 작물 코드표(`crops`)를 작물명·이모지·기본 선택값·작물 선택지로 사용. 공간 유형·면적 단위 선택지는 화면 내부 고정 설정 | `app/src/data.ts`, `app/src/onboarding/SetupFlow.tsx`, `app/src/navigation/PotMenu.tsx`, `app/src/navigation/PotManager.tsx` | 공간·기기·화분·개별 센서 상태는 API. 작물 목록은 온보딩 검색에서 API를 호출하지만, 헤더/화분 관리의 선택지는 아직 정적 `crops` 사용 |
| 공통 헤더 알림 | 알림 2건의 제목·본문·시각·심각도(`initialAlerts`), 화면별 제목·설명(`pageCopy`) | `app/src/navigation/Header.tsx` | 알림 조회·읽음 처리 API가 없어, ‘모두 읽음’ 상태도 화면 메모리에서만 변경 |
| 진단 이력 | 없음 | - | 이력 점수·요약·이슈는 `GET /api/pots/:potId/diagnostic-history` 사용 |

### 현재 화면에서 사용되지 않는 잔존 목데이터

| 데이터 | 위치 | 상태 |
| --- | --- | --- |
| `dashboardSpace`, `factors`, `sensors`, `fallbackSoilTemperatureReport`, `historyRecords`, `historyComparison`, `sidebarDeviceInfo`, `getSidebarFarmInfoRows` | `app/src/data.ts` | 현재 일반 앱에서 사용되지 않음 |
| `score`, `altCrops`, `equipment`, `dailyAvg`, `rangeTabs`, `chartMetrics` | `app/src/data.ts` | 현재 일반 앱에서 사용되지 않음 |

## API 연동 현황

### 공통 요청 처리

`app/src/auth/authApi.ts`의 `apiRequest`가 모든 HTTP 요청을 처리하고, `authenticatedRequest`가 저장된 JWT를 `Authorization: Bearer <token>` 헤더에 넣습니다. API 서버 주소는 `EXPO_PUBLIC_API_BASE_URL` 또는 기본값(`http://localhost:8080`)을 사용합니다.

### API 클라이언트와 호출 대상

| 프론트 API 코드 | 실제 호출 화면/흐름 | 호출 API |
| --- | --- | --- |
| `app/src/auth/authApi.ts` | 로그인, 회원가입, 세션 복원 | `POST /api/auth/login`, `POST /api/auth/signup`, `GET /api/me` |
| `app/src/device/deviceApi.ts` | 기기 등록·조회, 화분 생성·수정 | `POST /api/devices`, `GET /api/devices/:deviceId`, `POST /api/devices/:deviceId/pots`, `PATCH /api/pots/:potId` |
| `app/src/space/spaceApi.ts` | 공간 목록 조회, 공간 등록 | `GET /api/spaces`, `POST /api/spaces` |
| `app/src/pot/potApi.ts` | 화분 목록·상세 조회 및 선택 상태 갱신 | `GET /api/pots`, `GET /api/pots/:potId` |
| `app/src/sensor/sensorApi.ts` | 기기별 센서 목록·상태 조회 | `GET /api/devices/:deviceId/sensors` |
| `app/src/crop/cropApi.ts` | 작물 검색·선택 | `GET /api/crops`, `PATCH /api/pots/:potId/crop` |
| `app/src/measurement/measurementApi.ts` | 최신 측정값, 환경 점수, 5개 지표 시계열 | `GET /api/pots/:potId/measurements/latest`, `GET /api/pots/:potId/score`, `GET /api/pots/:potId/measurements` |
| `app/src/soil/soilApi.ts` | 토양 배합 추천 | `GET /api/pots/:potId/soil-recommendation` |
| `app/src/analysis/analysisApi.ts` | 대체 작물 추천 | `GET /api/pots/:potId/crop-recommendations` |
| `app/src/history/historyApi.ts` | 측정 이력 기반 진단 점수 이력 | `GET /api/pots/:potId/diagnostic-history` |
| `app/src/shop/shopApi.ts` | 상품 목록 | `GET /api/products` |
| `app/src/cart/cartApi.ts` | 상품 구매 화면의 장바구니 조회·추가·수량 변경·삭제 | `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/:productId`, `DELETE /api/cart/items/:productId`, `DELETE /api/cart` |
| `app/src/order/orderApi.ts` | 주문 생성, 주문 내역·상세 조회, 결제 전 주문 취소 | `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:orderId`, `POST /api/orders/:orderId/cancel` |
| `app/src/payment/paymentApi.ts` | 토스 결제 준비·승인·실패 처리 및 결제 반환 화면 | `POST /api/payments/ready`, `POST /api/payments/confirm`, `POST /api/payments/fail`, `GET /api/orders/:orderId/payment`, `POST /api/payments/:paymentId/cancel` |
| `app/src/care/carePlanApi.ts` | Gemini 기반 관리 우선순위·지표별 상세 진단·오늘 할 일·재배 기준·개선 방안·7일 일정·예상 변화·상품 추천 | `GET /api/pots/:potId/care-plan` |

### 화면별 연동 상태

| 화면 | 상태 | 실제 API 연동 범위 | 남은 정적 영역/제약 |
| --- | --- | --- | --- |
| 대시보드 | 완료 | 공간·기기 연결 상태, 기기별 센서 상태, 최신값, 환경 점수 factor(온도·습도·조도·토양 수분·토양 온도), 5개 지표 시계열 | 차트 표시 설정·작물명 코드표는 정적 설정 |
| 실시간 모니터링 | 완료 | 최신값과 5개 지표의 시계열, 최저·최고값 | 없음 |
| 공간 진단 | 완료 (Gemini 설정 기준) | 공간명, 환경 점수 factor 5종, 최신 측정값, 토양 추천, 대체 작물 추천, Gemini 관리 우선순위·지표별 상세 진단·개선 방안·7일 일정·예상 변화 | Gemini 키 미설정·호출 실패 시 기존 정적 안내로 fallback |
| 진단 이력 | 완료 | 최근 30일 측정 샘플을 기준으로 재계산한 적합도 이력 | 측정 데이터가 없으면 이력도 없음 |
| 관리 가이드 | 완료 (Gemini 설정 기준) | 토양 배합·재료·주의사항, Gemini 오늘 할 일·재배 기준·상품 추천 | Gemini 키 미설정·호출 실패 시 기존 정적 안내로 fallback. 작업 완료 상태는 화면 메모리에만 유지 |
| 상품 구매 | 완료 (웹 결제 기준) | 상품 목록, 서버 장바구니, 주문 생성·내역·상세·결제 전 취소, 토스 결제 준비·승인·실패 반환 처리 | 토스 결제창은 웹에서만 지원하며, `TOSS_PAYMENTS_ENABLED`와 토스 키·성공/실패 URL 설정이 필요. 결제 완료 주문의 환불/결제 취소 UI는 아직 없음 |
| 사이드바 | 완료 | 기기 상태, 공간, 화분 수, 마지막 수신 시각, 기기별 센서 상태 | 없음 |
| 기기 등록 온보딩 | 완료 | 공간 목록 조회·기존 공간 선택, 새 공간 저장 후 기기 연결 | 기존 공간은 `spaceId`로 연결하고, 새 공간은 `POST /api/spaces`로 저장 |
| 화분 선택 메뉴 | 완료 | 현재 기기의 화분 목록 조회와 선택 화분 상세 조회 | 화분 생성·수정은 기존 기기 API 흐름에서 처리 |

### 남은 API 연동·UI 작업

| 대상 | 필요한 작업 | 현재 백엔드 상태 |
| --- | --- | --- |
| 공통 헤더 알림 | 알림 조회·읽음 처리 API와 영속 상태 연결 | 대응 API 없음 |
| 작물 선택지 통합 | 화분 관리·헤더의 정적 `crops` 선택지를 `GET /api/crops` 응답으로 통합 | 작물 조회·화분 작물 변경 API 구현됨 |
| 결제 완료 주문 취소 | `GET /api/orders/:orderId/payment`, `POST /api/payments/:paymentId/cancel`을 주문 내역 UI에 연결 | 백엔드와 프론트 API 클라이언트 구현됨, 화면 미연결 |
