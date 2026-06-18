# 해빛스쿨 챗봇

해빛스쿨 앱 기록과 연동되는 해빛코치 챗봇 서버입니다.
카카오 스킬과 MessengerBot 경로를 모두 지원합니다.

---

## 구조

```text
index.js
routes/
  kakao.js
  messengerbot.js
commands/
  guide.js
  today.js
  myHabits.js
  weekly.js
  classStatus.js
  register.js
  ranking.js
  categoryHabits.js
  addFriend.js
modules/
  appFirebase.js
  userMapping.js
  statsHelpers.js
  habitCheckers.js
utils/
  gemini.js
  habitLogger.js
  kakaoTemplate.js
  apiKeyAuth.js
```

---

## 환경 변수

| 이름 | 설명 | 필수 |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API 키 | 예 |
| `MESSENGER_API_KEY` | MessengerBot API 키 | 예 |
| `FIREBASE_DB_URL` | Firebase Realtime DB URL | 선택 |
| `RENDER_URL` | Self-ping URL | 선택 |
| `RATE_LIMIT_MAX` | 분당 최대 요청 수 | 선택 |

---

## MessengerBot 설정

1. [messengerbot_script.js](/C:/SJ/antigravity/habitchatbot/messengerbot_script.js)의 내용을 MessengerBot 스크립트에 붙여 넣습니다.
2. `SERVER_URL`, `GROUP_ROOM_NAME`, `API_KEY`를 실제 값으로 바꿉니다.
3. MessengerBot 앱에서 카카오톡 알림 접근 권한을 허용합니다.

예시:

```javascript
const SERVER_URL = "https://habitchatbot.onrender.com/api/messengerbot";
const GROUP_ROOM_NAME = "실제 단톡방 이름";
const API_KEY = "Render의 MESSENGER_API_KEY와 같은 값";
```

주의:
- 자동 아침/점심/저녁/밤 브로드캐스트 기능은 제거되었습니다.
- 주간/월간 베스트 자동 게시는 기존 카카오 오픈채팅봇 밤 예약 메시지 `!오늘`에 함께 붙습니다.
  - KST 월요일 `!오늘`: 지난 한 주 베스트 3도 함께 표시
  - KST 매달 1일 `!오늘`: 지난 한 달 베스트 3도 함께 표시
- 현재 챗봇은 `/api/chat`, `/api/messengerbot`만 사용합니다.

---

## 명령어

| 명령어 | 설명 |
|---|---|
| `!안내` | 시작 가이드 |
| `!오늘` | 오늘 전체 기록 요약 |
| `!내습관` | 내 기록 요약 |
| `!주간` | 주간 리포트 |
| `!우리반` | 전체 현황 |
| `!순위` | 이번 주 리더보드 |
| `!지난주베스트` | 지난 월-일 베스트 3 기록 성적 |
| `!지난달베스트` | 지난달 베스트 3 기록 성적 |
| `!등록 이메일` | 앱 계정 연결 |
| `!내코드` | 친구 코드 확인 |
| `!친구 코드` | 친구 추가 |
| `!해빛` | 로그인 없이 볼 수 있는 내 하루 기록 공유 링크 |
| `!해빛영상` | 사진·운동 영상·감사일기와 오리지널 BGM을 묶은 세로형 MP4 |
| `!식단` | 식단 현황 + AI 코칭 |
| `!운동` | 운동 현황 + AI 코칭 |
| `!마음` | 수면/감사/명상 현황 + AI 코칭 |

일반 질문도 해빛코치가 답변합니다.

---

## 로컬 실행

```bash
npm install
node index.js
```

헬스 체크:

```bash
curl http://localhost:3000/health
```

---

## 배포 메모

- Render Start Command: `node index.js`
- Firebase 서비스 계정 키는 저장소가 아니라 시크릿 파일이나 환경 변수로 관리해야 합니다.
