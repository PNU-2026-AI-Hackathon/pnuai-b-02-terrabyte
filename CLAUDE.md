# TerraByte 프로젝트 지침

이 저장소에서 작업하는 모든 AI 에이전트는 아래 규칙을 **엄격히** 따릅니다.
상세 규칙의 원본(source of truth)은 `docs/strategy/` 문서들이며, 충돌 시 그 문서가 우선합니다.

- `docs/strategy/branch_strategy.md` — 브랜치 네이밍·워크플로우
- `docs/strategy/commit_strategy.md` — 커밋 메시지 규칙
- `docs/strategy/pr_strategy.md` — PR 작성·리뷰·병합 규칙
- `docs/strategy/issue_strategy.md` — 이슈 규칙

## Git 절대 규칙 (위반 금지)

1. **`develop`·`main`에서 절대 직접 작업/커밋/push하지 않는다.**
   파일을 하나라도 수정하기 전에 반드시 현재 브랜치를 확인하고(`git branch --show-current`),
   `develop`/`main`이면 먼저 작업 브랜치를 생성한다.
2. **브랜치 네이밍**: `feature/<desc>`, `fix/<desc>`, `refactor/<desc>`, `docs/<desc>`,
   `test/<desc>`, `chore/deps-<pkg>` — 영어 소문자·숫자·`/`·`-`만, 설명은 2~5단어.
3. **커밋 메시지**: `<type>[(scope)]: <요약>` 형식, 요약 50자 이내,
   커밋 하나 = 논리적 변경 하나. type: feat/fix/docs/style/refactor/test/build/ci/perf/chore.
4. **PR**: base는 조직 저장소(`PNU-2026-AI-Hackathon/pnuai-b-02-terrabyte`)의 `develop`.
   제목 `<type>: <summary>`, 본문은 pr_strategy.md 템플릿(변경 목적/주요 변경 사항/테스트 방법/관련 이슈/참고 사항).
   assignee = 작성자 본인, reviewer = 본인 제외 팀원 전원 + Copilot.
   PR 하나 = 논리적 변경 하나. 병합은 반드시 `Squash and merge`.
5. **동기화**: pull(머지) 금지. 반드시 다음 절차 사용:
   ```bash
   git checkout develop
   git fetch upstream
   git reset --hard upstream/develop
   ```
   (`upstream` = 조직 저장소, `origin` = 개인 포크. upstream이 없으면 먼저 등록한다.)
6. **병합 후**: 작업 브랜치 삭제, 로컬 `develop`을 위 절차로 재동기화.

## 작업 시작 체크리스트 (매 작업마다)

1. `git branch --show-current` — develop/main이면 즉시 새 작업 브랜치 생성
2. `git status` — 이전 작업 잔여물 확인 (있으면 사용자에게 보고)
3. 작업 전 develop을 upstream 기준으로 동기화 후 브랜치 분기

## 강제 장치

`.claude/settings.json`의 PreToolUse 훅이 `develop`/`main` 브랜치에서의
`git commit`/`git push`, 그리고 develop/main을 대상으로 한 push를 자동 차단한다
(`.claude/hooks/protect-branches.js`). 훅이 차단하면 우회하지 말고
규칙에 맞는 작업 브랜치를 생성해 진행할 것.

## 실수했을 때 복구 절차

develop에서 실수로 작업한 경우 (커밋 전):
```bash
git checkout -b feature/<desc>   # 미커밋 변경은 새 브랜치로 따라온다
# 커밋 후 develop으로 돌아가면 develop은 깨끗해진다
```
develop에서 실수로 커밋까지 한 경우 (push 전):
```bash
git branch feature/<desc>        # 현재 커밋을 가리키는 브랜치 생성
git checkout develop
git reset --hard upstream/develop
git checkout feature/<desc>
```
