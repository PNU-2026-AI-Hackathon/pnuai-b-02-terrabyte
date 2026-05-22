### 1. 프로젝트 소개
#### 1.1. 개발배경 및 필요성
기후 위기와 식량 안보 문제로 스마트팜이 주목받고 있으며, 도심의 유휴공간(옥상, 지하 공간, 공실 등)을 새로운 농업 생산 공간으로 전환하려는 시도가 증가하고 있습니다. 하지만 기존 스마트팜 기술은 이미 구축된 농장의 자동 제어에만 초점이 맞춰져 있어, 해당 유휴공간이 작물 재배에 적합한지 객관적으로 판단하기 어렵다는 문제가 있습니다. 공간 특성을 고려하지 않은 무리한 설비 투자는 초기 비용 증가와 에너지 비효율을 초래하므로, 설치 이전 단계에서 공간의 환경 적합성을 데이터 기반으로 진단하는 서비스가 필수적입니다.

#### 1.2. 개발 목표 및 주요 내용
본 프로젝트의 목표는 도심 유휴공간의 스마트팜 전환 가능성을 진단하고, 설치 이후에는 재배 환경을 지속적으로 모니터링하는 통합 솔루션을 개발하는 것입니다. 단일 하드웨어 키트(ESP32 기반 7종 센서)를 통해 공간 적합도를 분석하고 비용 효율적인 설계를 제안하며, 사용자에게 점수와 시각화 인터페이스를 제공하여 비전문가도 쉽게 스마트팜 재배 리스크를 최소화할 수 있도록 지원합니다.

#### 1.3. 세부내용
 - 공간 적합도 진단: 온도, 습도, 조도, CO2, 미세먼지, 소음 등 주요 환경 요소를 종합 분석하여 공간 적합도 산출.

 - 개선 항목 분석 및 구축 비용 산출: 부족한 환경 요소(예: 조도 부족)를 파악하고 인공조명 설치 등 필요한 보완 방향과 예상 비용을 수립.

 - 실시간 재배 환경 관리: 스마트팜 구축 후 토양 수분, 온도 등을 지속 모니터링하고 임계치 초과 시 Push 알림 제공.

 - 직관적 대시보드: 복잡한 센서 수치가 아닌 점수, 그래프, 색상 기반의 시각화 보고서 제공.

#### 1.4. 기존 서비스 대비 차별성
 - 설치 '이전' 단계의 진단 집중: 구축 이후 모니터링에 집중한 기존 솔루션과 달리, 후보 공간의 재배 적합성을 미리 판단하여 과잉 투자를 방지.

 - 이분법적 진단을 넘은 직관적 리포트: 단순 센서 수치 나열이 아닌, 작물별 권장 생육 범위와의 편차를 점수화 및 시각화하여 우선순위 안내.

 - AI 기반 정교한 공간 진단 알고리즘: 환경 요소가 복합적으로 생육에 미치는 영향을 AI 모델로 분석하여 적합 작물 추천 및 진단.

 - 하나의 통합 키트 제공 (공간 분석 + 토양 분석): 진단 단계의 데이터와 재배 기간의 모니터링 데이터를 연계하여 하나의 플랫폼에서 관리.

#### 1.5. 사회적가치 도입 계획
 - 도시 재생 및 유휴공간 부가가치 창출: 도심 내 버려진 공간의 농업적 활용 가능성을 데이터로 입증.

 - 진입 장벽 완화: 직관적 인터페이스 제공으로 비전문가(초보 농업인, 실버 세대 등)의 스마트팜 운영을 돕고 새로운 로컬푸드 생태계 형성에 기여.


### 2. 상세설계
#### 2.1. 시스템 구성도
> 시스템 구성도(infra, front, back등의 node 간의 관계)의 사진을 삽입하세요.

#### 2.1. 사용 기술

| 분야 | 기술 스택 | 버전 | 활용 목적 및 상세 |
|:---:|:---|:---:|:---|
| **Frontend** | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white) | v5.x<br/>v14.x | 사용자용 웹 대시보드 및 UI 컴포넌트 개발 |
| **Backend** | ![Java](https://img.shields.io/badge/Java-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white) ![Spring Boot](https://img.shields.io/badge/Spring_Boot-6DB33F?style=for-the-badge&logo=spring-boot&logoColor=white) | v17<br/>v3.x | 센서 데이터 수신, 공간 적합도 분석, 비용 산출 로직 구현 |
| **Hardware<br/>& IoT** | ![C](https://img.shields.io/badge/C-00599C?style=for-the-badge&logo=c&logoColor=white) ![C++](https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white) ![ESP32](https://img.shields.io/badge/ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white)<br/>![MQTT](https://img.shields.io/badge/MQTT-660066?style=for-the-badge&logo=mqtt&logoColor=white) | - | HW 센서 제어 로직 및 펌웨어 구현<br/>7종 센서 통합 모듈 통신 보드<br/>저전력 실시간 데이터 전송 프로토콜 |
| **Database** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) ![InfluxDB](https://img.shields.io/badge/InfluxDB-22ADF6?style=for-the-badge&logo=influxdb&logoColor=white) | - | 사용자 정보, 공간 정보 및 진단 결과 관리<br/>시계열 기반 센서 데이터 로그 저장 |
| **Infra** | ![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white) ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black) | - | EC2 기반 서버 배포 및 운영<br/>이상 상태 감지 시 Real-time Push 알림 발송 |
| **AI & AI<br/>Coding Tools** | ![GitHub Copilot](https://img.shields.io/badge/GitHub_Copilot-181717?style=for-the-badge&logo=github&logoColor=white) ![ChatGPT](https://img.shields.io/badge/ChatGPT-412991?style=for-the-badge&logo=openai&logoColor=white)<br/>![Claude](https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white) ![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=for-the-badge&logo=googlebard&logoColor=white) ![v0.dev](https://img.shields.io/badge/v0.dev-000000?style=for-the-badge&logo=vercel&logoColor=white) | - | 실시간 코드 리뷰, 예외 처리 및 보안 점검<br/>기술 문서, API 명세 작성 및 진단 알고리즘 설계 보조<br/>API 구현, DB 스키마 생성 및 초기 인프라 자동 생성<br/>가상 센서 데이터 시뮬레이션 및 시스템 동작 사전 검증<br/>자연어 기반 대시보드 화면 및 UI 컴포넌트 프로토타이핑 |
| **IDE &<br/>협업** | ![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white) ![IntelliJ IDEA](https://img.shields.io/badge/IntelliJ_IDEA-000000?style=for-the-badge&logo=intellij-idea&logoColor=white) ![CLion](https://img.shields.io/badge/CLion-000000?style=for-the-badge&logo=clion&logoColor=white) | - | 버전 관리 및 팀 협업<br/>개발 환경 (백엔드, 프론트엔드, C/C++) |

### 3. 개발결과
#### 3.1. 전체시스템 흐름도
> 위 내용을 작성하세요.

#### 3.2. 기능설명
> 각 페이지 마다 사용자의 입력의 종류와 입력에 따른 결과 설명 및 시연 영상.
> 
> ex. 로그인 페이지:
> 
> - 이메일 주소와 비밀번호를 입력하면 입력창에서 유효성 검사가 진행됩니다.
> 
> - 요효성 검사를 통과하지 못한 경우, 각 경고 문구가 입력창 하단에 표시됩니다.
>   
> - 유효성 검사를 통과한 경우, 로그인 버튼이 활성화 됩니다.
>   
> - 로그인 버튼을 클릭 시, 입력한 이메일 주소와 비밀번호에 대한 계정이 있는지 확인합니다.
>   
> - 계정이 없는 경우, 경고문구가 나타납니다.
>
> (영상)

#### 3.3. 기능명세서
> 개발한 제품에 대한 기능명세서를 작성해 제출하세요.
> 
> 노션 링크, 한글 문서, pdf 파일, 구글 스프레드 시트 등...

#### 3.4. 디렉토리 구조
> 위 레포지토리의 디렉토리 구조를 설명하세요.

#### 3.5 AI 도구 활용
> AI 도구를 어떤 단계에서 어떻게 활용했는지, 어떤 성과가 도출되었는지 기술해주세요.

### 4. 설치 및 사용 방법
> 제품을 설치하기 위헤 필요한 소프트웨어 및 설치 방법을 작성하세요.
>
> 제품을 설치하고 난 후, 실행 할 수 있는 방법을 작성하세요.

### 5. 소개 및 시연 영상
> 프로젝트에 대한 소개와 시연 영상을 넣으세요.
> 프로젝트 소개 동영상을 교육원 메일(swedu@pusan.ac.kr)로 제출 이후 센터에서 부여받은 youtube URL주소를 넣으세요.

### 6. 팀 소개
| LEADER | MEMBER1 | MEMBER2 | MEMBER3 | MEMBER4 |
|:---:|:---:|:---:|:---:|:---:|
| [김동현](https://github.com/cnvxlns) | [김민서](https://github.com/oesmln) | [김효빈](https://github.com/iris11132-max) | [문성현](https://github.com/7hyunii) | [박태훈](https://github.com/Reighnex) |
| okmac03@pusan.ac.kr | kmmlns@gmail.com | irisrla@naver.com | 7sonicx@gmail.com | pth4241@pusan.ac.kr |
| HW 설계 | 백엔드 및 DevOps | 기획도메인 분석 | 풀스택 개발 | 공간진단알고리즘 설계 |

### 7. 해커톤 참여 후기
> 팀원 별 해커톤 참여 후기를 작성하세요.
