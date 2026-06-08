# Commit Strategy

이 문서는 협업 시 일관된 커밋 메시지를 정의합니다.

## 커밋 메시지 포맷

```bash
<type>[(scope)]: <short summary>

[body]

```

- `type` 예시:
  - `feat`: 새로운 기능
  - `fix`: 버그 수정
  - `docs`: 문서 변경
  - `style`: 포매팅/스타일 (기능 변경 없음)
  - `refactor`: 리팩터링
  - `test`: 테스트 관련
  - `build`: 빌드 관련
  - `ci`: CI 설정 변경
  - `perf`: 성능 개선
  - `chore`: 기타 잡일 (자잘한 수정)

- 하나의 커밋에는 하나의 논리적 변경만 포함합니다.
- `short summary`는 50자 이내로 간결하게 작성합니다.
- `body`는 선택 사항이며, 필요한 경우 변경 이유와 중요한 구현 세부사항을 기술합니다.

### 예시
- `feat(auth): 구글 OAuth2 로그인 추가`
- `fix(api): 사용자 서비스 널 포인터 처리`
- `docs: 배포 관련 README 업데이트`
