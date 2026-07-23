# Pull Request Strategy

이 문서는 Pull Request 작성과 리뷰 규칙을 정의합니다. <br>팀의 일관된 코드 리뷰와 안정적인 병합을 위해 아래 규칙을 따라주세요.

## Pull Request 작성 규칙
- PR 대상 브랜치는 기본적으로 조직 레포지토리의 `develop`으로 설정합니다.
- PR 제목은 `<type>: <summary>` 형식으로 한 줄 요약합니다.
- PR 본문에는 변경 목적, 주요 변경 사항, 테스트 방법 등 필요한 내용을 작성합니다.
- 관련 이슈가 있다면 PR 본문에 이슈 번호를 연결합니다.
- PR의 assignee는 PR 작성자로 지정하고, reviewer는 PR 작성자를 제외한 모든 팀원으로 지정합니다.
- 작업 범위가 너무 커지지 않도록 하나의 PR에는 하나의 논리적 변경만 포함합니다.

## Pull Request 본문 템플릿

```md
## 변경 목적 (필요 시)
- 

## 주요 변경 사항
- 

## 테스트 방법 (필요 시)
- 

## 관련 이슈 (필요 시)
- 

## 참고 사항 (필요 시)
- 
```

- `참고 사항`은 리뷰어가 알아야 할 내용이 있을 때 작성합니다.
- `관련 이슈`에는 `close #이슈번호` 형식으로 연결합니다.

## 리뷰 규칙
- 리뷰어를 지정하고 GitHub Copilot에도 리뷰를 요청합니다.
- PR 작성 후 24시간 이내 리뷰를 기준으로 합니다.
- 단순 승인만 하지 말고, 최소 1개의 구체적인 코멘트를 남깁니다.
- 리뷰어는 기능 동작, 코드 가독성, 테스트 여부를 함께 확인합니다.
- 수정 요청을 받은 작성자는 반영 여부를 댓글로 공유합니다.

## 병합 규칙
- 충돌이 발생하면 PR 작성자가 해결한 뒤 다시 리뷰를 요청합니다.
- 2명 이상의 리뷰어 승인 후 병합합니다.
- 병합은 PR 작성자가 팀원들의 승인을 확인한 후 직접 진행합니다.
- 병합 방식은 반드시 `Squash and merge`를 사용합니다.
- 승인된 PR만 `develop`으로 병합합니다.
- PR 병합 후에는 로컬 `develop`을 조직 저장소의 `develop`과 다시 동기화합니다.
- 작업 중 다른 사람의 변경사항은 PR에서 충돌이 발생하거나 꼭 필요한 경우에만 작업 브랜치에 반영합니다.

## 적층(Stacked) PR 규칙

적층 PR이란 병합되지 않은 다른 작업 브랜치 위에서 분기해 만든 PR을 말합니다. <br>
`Squash and merge`는 PR 커밋들을 develop에 **해시가 다른 새 커밋 하나**로 만들기 때문에, 부모 PR이 병합된 뒤 자식 브랜치에서 일반 `rebase`/`merge`를 하면 같은 변경을 두 번 적용하려다 충돌이 발생합니다.

### 기본 원칙: 적층하지 않기
- PR이 병합되기 전에는 그 브랜치 위에서 새 작업 브랜치를 만들지 않습니다.
- PR을 작게 나누고 리뷰·병합 주기를 짧게 가져가는 것을 우선합니다.

### 불가피하게 적층한 경우
1. 자식 PR은 base를 `develop`이 아닌 **부모 브랜치**로 지정합니다.
   - diff에 부모 커밋이 섞이지 않고, 부모가 병합되어 브랜치가 삭제되면 GitHub이 base를 자동으로 develop으로 전환합니다.
   - 규칙을 모르는 팀원이 자식 PR을 실수로 병합해도 develop이 아닌 부모 브랜치로 병합되므로, **develop 오염이 구조적으로 차단**됩니다.
2. 부모 PR이 병합되기 전까지 자식 PR은 **Draft** 상태로 둡니다.
   - Draft 상태에서는 GitHub이 머지 버튼을 비활성화하므로 병합 순서 사고가 UI 차원에서 막힙니다.
   - 부모 병합 + 아래 rebase 완료 후에 "Ready for review"로 전환합니다.
3. 부모 PR이 squash 병합된 직후, 자식 브랜치는 일반 rebase 대신 아래 명령을 사용합니다.

```bash
git fetch upstream
git rebase --onto upstream/develop <부모브랜치> <자식브랜치>
git push --force-with-lease origin <자식브랜치>
```

`--onto`는 부모 브랜치 구간의 커밋을 건너뛰고 자식의 순수 커밋만 develop 위로 옮기므로, squash로 인한 중복 적용 충돌이 발생하지 않습니다.

### 충돌 발생 시 대응 순서
- 병합 순서가 꼬여 충돌이 나면 **revert보다 위 rebase 절차를 먼저** 시도합니다.
- Revert는 develop 이력에 노이즈를 남기고, revert된 변경이 다른 PR에 실려 다시 들어오면 커밋 단위 추적(blame/bisect)이 어려워지므로 최후 수단으로만 사용합니다.

### 추후 강화 옵션 (필요 시 도입)
- 적층 PR 사용이 잦아지면 PR 본문에 `Depends-on: #번호`를 표기하고, 해당 PR이 병합되기 전까지 required status check를 실패시키는 GitHub Actions를 추가해 머지 버튼을 잠글 수 있습니다.
- Branch protection의 "Require branches to be up to date before merging"을 켜면 오래된 base 기준 PR의 병합이 차단되어, rebase를 건너뛰는 실수가 강제로 드러납니다.

## 📌 작업 흐름 예시

### 1. PR 생성
작업 브랜치를 원격 저장소에 푸시한 뒤 GitHub에서 Pull Request를 생성합니다.

```bash
# 예시: 로그인 페이지 작업 브랜치 푸시
git push origin feature/login-page
```

### 2. PR 내용 작성
PR 제목은 `<type>: <summary>` 형식으로 작성하고, 본문에는 필요한 내용을 작성합니다.

```bash
# PR 제목 예시
feat: 로그인 페이지 UI 구현
```

```md
## 변경 목적
- 사용자가 로그인할 수 있는 기본 화면을 제공합니다.

## 주요 변경 사항
- 로그인 페이지 레이아웃 추가
- 이메일/비밀번호 입력 폼 추가

## 테스트 방법
- 로컬에서 로그인 페이지 렌더링 확인

## 관련 이슈
- close #12
```

### 3. 리뷰 요청
PR 작성자는 assignee에 본인을 지정하고, reviewer에는 본인을 제외한 모든 팀원을 지정합니다. <br>GitHub Copilot에도 리뷰를 요청하며, 수정 요청이 있으면 작업 브랜치에 추가 커밋을 푸시합니다.

### 4. 충돌 해결 (필요 시)
PR에서 충돌이 표시되면, 작업 브랜치에 최신 `develop`을 병합합니다. <br>
Git이 자동으로 합치지 못한 파일은 직접 수정해야 합니다.

```bash
git checkout feature/login-page
git fetch upstream
git merge upstream/develop
```

충돌이 발생한 파일에는 아래와 같은 표시가 생깁니다.

```text
<<<<<<< HEAD
내 작업 내용
=======
develop에 들어온 변경 내용
>>>>>>> upstream/develop
```

충돌 표시를 확인하고 필요한 내용만 남긴 뒤 저장합니다. 그 다음 아래 명령어로 반영합니다.

```bash
git add .
git commit
git push origin feature/login-page
```

### 5. 병합
PR 작성자는 팀원들의 승인을 확인한 후 `Squash and merge` 방식으로 PR을 `develop`에 병합하고, 병합된 작업 브랜치는 삭제합니다.

### 6. 병합 후 로컬 정리
`Squash and merge`는 PR 커밋을 새로운 커밋 하나로 다시 만들기 때문에, 병합 후 로컬 `develop`을 조직 저장소 기준으로 맞춥니다.

```bash
git checkout develop
git status
git fetch upstream
git reset --hard upstream/develop
```

`git status`에서 커밋하지 않은 변경사항이 있다면 먼저 커밋하거나 stash한 뒤 진행합니다. <br>
다음 작업은 정리된 `develop`에서 새 작업 브랜치를 만들어 시작합니다.
