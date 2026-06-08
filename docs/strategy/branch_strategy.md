# Branch Strategy

이 문서는 브랜치 네이밍과 기본 워크플로우를 정의합니다. <br>팀의 일관된 개발 흐름을 위해 아래 규칙을 따라주세요.

## 브랜치 종류 및 네이밍
- `main`: 배포 가능한 코드만 존재 (프로덕션)
- `develop`: 다음 릴리즈 통합 브랜치
- 기능 브랜치: `feature/<short-description>` (예: `feature/login-oauth`)
- 버그 수정 브랜치: `fix/<short-description>` (예: `fix/null-pointer-user`)
- 리팩토링 브랜치: `refactor/<short-description>`
- 문서 작업 브랜치: `docs/<short-description>` (예: `docs/update-readme`)
- 테스트 작업 브랜치: `test/<short-description>` (예: `test/auth-service`)
- 의존성 업데이트: `chore/deps-<pkg>`

브랜치 이름 규칙
- 영어 소문자, 숫자, `/`, `-`만 사용합니다.
- 공백, 한글, 특수문자는 사용하지 않습니다.
- 설명은 2~5단어 이내로 간결하게 작성합니다.

## 브랜치 생성/병합 흐름
- 모든 작업은 목적에 맞는 작업 브랜치에서 진행 후 조직 레포지토리의 `develop`으로 PR 생성
- `main`과 `develop`에는 직접 push하지 않고 PR을 통해 병합
- 관리자는 정기적으로 `develop` → `main`으로 릴리즈 머지
- PR 병합 후 작업 브랜치는 삭제


## 📌 작업 흐름 예시

### 0. 초기 설정
```bash
# 조직 저장소 별칭(upstream) 등록
git remote add upstream [조직 레포지토리 URL]

# 연결 확인
git remote -v
```

### 1. 최신화 (Sync)
작업 시작 전, 내 로컬의 `develop`을 조직 저장소(Upstream)와 똑같이 맞춥니다. <br>
우리 팀은 PR 병합 시 `Squash and merge`를 사용하므로, pull 방식 대신 `fetch` 후 `reset`으로 동기화합니다.
```bash
# 로컬 develop 브랜치로 이동
git checkout develop

# 커밋하지 않은 변경사항이 없는지 확인
git status

# 조직 저장소(upstream)의 최신 내용을 가져오기
git fetch upstream

# 로컬 develop을 조직 저장소의 develop과 동일하게 맞추기
git reset --hard upstream/develop
```

`git status`에서 커밋하지 않은 변경사항이 있다면 먼저 커밋하거나 stash한 뒤 진행합니다.

### 2. 브랜치 생성 (Branch)
develop에서 바로 작업하지 않고, 작업 전용 브랜치를 새로 만듭니다.

```bash
# 형식: git checkout -b [기능명]
# 예시: 로그인 페이지 작업 시
git checkout -b feature/login-page
```

### 3. 작업 및 커밋 (Commit)
코드를 작성하고 저장합니다.

```bash
# 변경된 파일 전체 스테이징
git add .

# 커밋 메시지 작성 (예: feat, fix 등 말머리 사용 권장)
git commit -m "feat: 로그인 페이지 UI 구현 완료"
```

### 4. 푸시 (Push)
작업한 브랜치를 내 원격 저장소(Origin)에 업로드합니다.

```bash
# 형식: git push origin [작업한 브랜치명]
git push origin feature/login-page
```

### 5. PR 요청 (Pull Request)
GitHub 웹사이트에서 내 포크 저장소의 브랜치를 조직 저장소로 합쳐달라고 요청합니다.

1. GitHub 본인 저장소(Fork) 페이지 접속
2. `'Compare & pull request'` 버튼 클릭
3. 방향(Direction) 확인:
    - base repository: 조직 저장소 / `base: develop` ⬅ (여기로 보냄)
    - head repository: 내 저장소 / `compare: PR보낼 내 저장소 브랜치`
4. 내용 작성 후 Create Pull Request

PR에서 충돌이 표시되면 `pr_strategy.md`의 충돌 해결 절차에 따라 작업 브랜치에 최신 `develop`을 병합합니다.
