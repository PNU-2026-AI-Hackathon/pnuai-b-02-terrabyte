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

Storybook 은 `make storybook` (http://localhost:6006).
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

Storybook 실행:

```powershell
cd frontend/app
npm run storybook
```

Storybook 빌드:

```powershell
cd frontend/app
npm run build-storybook
```
