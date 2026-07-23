# TerraByte Backend

TerraByte의 REST API, 사용자·기기 데이터, 센서 수집 및 환경 점수 조회를 담당하는 Spring Boot 서비스입니다.

## 기술 기준

- Java 17
- Spring Boot 3.5.16
- Gradle 8.14.3 Wrapper
- PostgreSQL: 사용자, 기기 등 업무 데이터
- SQLite: 작물별 환경 점수 프로필 및 계산 결과

## 로컬 실행

JDK 17 이상과 실행 중인 PostgreSQL이 필요합니다. 기본 연결 정보는 아래와 같습니다.

```text
database: terrabyte
username: terrabyte
password: terrabyte
```

환경에 맞게 다음 값을 설정할 수 있습니다.

```bash
export POSTGRES_URL='jdbc:postgresql://localhost:5432/terrabyte'
export POSTGRES_USER='terrabyte'
export POSTGRES_PASSWORD='terrabyte'
export SQLITE_URL='jdbc:sqlite:./db/terrabyte-score.db'
export JWT_SECRET='32바이트 이상의 운영용 비밀키로 변경하세요'

```

기존 SQLite 점수 스키마를 최초 한 번 적용합니다.

```bash
sqlite3 db/terrabyte-score.db < db/schema.sql
```

애플리케이션을 실행합니다.

```bash
./gradlew bootRun
```

상태 확인 주소는 `http://localhost:8080/actuator/health`입니다.

## 인증 API

```text
POST /api/auth/signup  회원가입 및 액세스 토큰 발급
POST /api/auth/login   로그인 및 액세스 토큰 발급
GET  /api/me           현재 사용자 조회
```

회원가입 요청 예시:

```json
{
  "email": "user@example.com",
  "password": "password1",
  "nickname": "테라바이트"
}
```

보호된 API에는 로그인 또는 회원가입 응답의 토큰을 전달합니다.

```text
Authorization: Bearer {accessToken}
```

개발용 JWT 비밀키는 기본값이 있지만 운영 환경에서는 반드시 `JWT_SECRET` 환경 변수로 교체해야 합니다.

## 테스트

테스트에서는 외부 PostgreSQL 대신 PostgreSQL 호환 모드의 인메모리 H2를 사용하고, 점수 DB는 인메모리 SQLite를 사용합니다.

```bash
./gradlew test
```
