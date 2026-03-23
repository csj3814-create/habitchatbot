# 해빛스쿨 챗봇

해빛스쿨 단톡방 + 카카오톡 오픈빌더 연동 AI 습관 코칭 챗봇 서버.

---

## 아키텍처

```
index.js                  ← 진입점 (114줄, 라우터 마운트만)
├── routes/
│   ├── kakao.js          ← 카카오 오픈빌더 /api/chat
│   ├── messengerbot.js   ← 메신저봇R /api/messengerbot
│   └── broadcast.js      ← 자동 브로드캐스트 /api/broadcast
├── commands/
│   ├── guide.js          ← !안내
│   ├── today.js          ← !오늘
│   ├── myHabits.js       ← !내습관
│   ├── weekly.js         ← !주간
│   ├── classStatus.js    ← !우리반
│   ├── register.js       ← !등록
│   ├── ranking.js        ← !랭킹
│   └── categoryHabits.js ← !식단 !운동 !마음
├── utils/
│   ├── gemini.js         ← Gemini AI 세션 관리
│   ├── habitLogger.js    ← 습관 키워드 감지 + Firebase 저장
│   ├── kakaoTemplate.js  ← 카카오 응답 템플릿 빌더
│   └── apiKeyAuth.js     ← MessengerBot API 키 인증 미들웨어
├── modules/
│   ├── appFirebase.js    ← 해빛스쿨 앱 Firestore 연동
│   ├── userMapping.js    ← 카카오/메신저봇 → 앱 계정 매핑
│   ├── statsHelpers.js   ← 통계 계산 공통 함수
│   └── habitCheckers.js  ← 습관 데이터 존재 판별 + KST 날짜 유틸
└── config.js             ← 환경변수 중앙 관리
```

---

## 환경변수 설정 (Render)

| 변수명 | 설명 | 필수 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API 키 | ✅ |
| `MESSENGER_API_KEY` | 메신저봇R 인증 키 | ✅ |
| `FIREBASE_DB_URL` | Firebase Realtime DB URL | 선택 (기본값 있음) |
| `RENDER_URL` | Self-ping URL | 선택 |
| `RATE_LIMIT_MAX` | IP당 분당 최대 요청 수 (기본 30) | 선택 |

---

## 메신저봇R 설정 가이드

### 1단계 — 스크립트 설치

`messengerbot_script.js` 전체 내용을 복사해서 메신저봇R 앱의 새 스크립트에 붙여넣기.

### 2단계 — 상단 상수 설정

```javascript
// 서버 주소 (변경 불필요)
const SERVER_URL = "https://habitchatbot.onrender.com/api/messengerbot";

// 실제 단톡방 이름으로 변경
const GROUP_ROOM_NAME = "해빛스쿨";

// Render 환경변수 MESSENGER_API_KEY 와 동일한 값
const API_KEY = "여기에_비밀_키_입력";
```

### 3단계 — 스케줄 설정

메신저봇R 앱 → 스크립트 설정 → **스케줄 활성화** → 간격: **1분**

자동 브로드캐스트 시간 (KST):
- 🌅 아침 08:00
- ☀️ 점심 12:00
- 🌆 저녁 18:30
- 🌙 취침전 21:00

### 4단계 — 알림 권한

메신저봇R 앱에서 카카오톡 알림 접근 권한 허용 필수.

---

## 사용 가능한 명령어

| 명령어 | 설명 | 앱 연결 필요 |
|---|---|---|
| `!안내` | 해빛스쿨 소개 + 시작 가이드 | ❌ |
| `!오늘` | 오늘 전체 기록 현황 | ❌ |
| `!우리반` | 기수 전체 현황 | ❌ |
| `!랭킹` | 이번 주 리더보드 | ❌ |
| `!등록 이메일` | 해빛스쿨 앱 계정 연결 | ❌ |
| `!내습관` | 내 기록 통계 | ✅ |
| `!주간` | 주간 트렌드 리포트 | ✅ |
| `!식단` | 식단 현황 + AI 분석 | ✅ |
| `!운동` | 운동 현황 + AI 분석 | ✅ |
| `!마음` | 마음습관 현황 + AI 분석 | ✅ |
| `!도움말` | 전체 명령어 목록 | ❌ |
| 자유 질문 | AI 코칭 (해빛코치) | ❌ |

---

## 신규 멤버 온보딩 플로우

```
멤버 입장/초대
    ↓ (즉시)
환영 메시지 + !안내 / !등록 / !도움말 안내
    ↓ (10초 후)
자기소개 부탁 메시지
    ↓ (멤버가 !안내 입력 시)
해빛스쿨 상세 소개 + 앱 연결 가이드
    ↓ (멤버가 !등록 이메일 입력 시)
앱 계정 연결 완료 → 개인화 AI 코칭 활성화
```

---

## 로컬 개발

```bash
# 의존성 설치
npm install

# .env 파일 생성
cp .env.example .env  # GEMINI_API_KEY, MESSENGER_API_KEY 입력

# 서버 실행
node index.js

# 헬스 체크
curl http://localhost:3000/health
```

---

## 배포 (Render)

- **플랜**: Free (Self-ping으로 절전 방지)
- **Start Command**: `node index.js`
- **Secret Files**: `/etc/secrets/serviceAccountKey.json`
