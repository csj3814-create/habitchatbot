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
| `RETENTION_DAYS` | 연결하지 않은 MessengerBot 데이터 보관 일수 (기본 30) | 선택 |
| `RETENTION_PURGE_ENABLED` | 보관 기간 지난 데이터 자동 삭제 (`false`면 끔) | 선택 |
| `RETENTION_INTERVAL_MS` | 삭제 잡 실행 주기 (기본 24시간) | 선택 |
| `FIREBASE_DB_URL` | Firebase Realtime DB URL | 선택 |
| `RENDER_URL` | Self-ping URL | 선택 |
| `RATE_LIMIT_MAX` | 분당 최대 요청 수 | 선택 |
| `DAILY_YOUTUBE_RECOMMENDATION_ENABLED` | `!오늘` 유튜브 추천 자동 첨부 여부 (`false`면 끔) | 선택 |
| `DAILY_YOUTUBE_PLAYLIST_ID` | 매일 추천할 YouTube 플레이리스트 ID | 선택 |

---

## MessengerBot 설정

1. [messengerbot_script.js](/C:/SJ/antigravity/habitchatbot/messengerbot_script.js)의 내용을 MessengerBot 스크립트에 붙여 넣습니다.
2. `SERVER_URL`, `API_KEY`를 실제 값으로 바꿉니다.
3. MessengerBot 앱에서 카카오톡 알림 접근 권한을 허용합니다.

예시:

```javascript
const SERVER_URL = "https://habitchatbot.onrender.com/api/messengerbot";
const API_KEY = "Render의 MESSENGER_API_KEY와 같은 값";
```

### ⚠️ 방 구분은 코드가 아니라 운영 약속입니다

**`!`로 시작하는 메세지는 봇 폰이 들어가 있는 모든 방에서 서버로 전달됩니다.**
스크립트에도 서버에도 방 필터가 없습니다. 넣을 수가 없습니다.

2026-08-15에 실제 로그로 확인한 내용입니다:

- MessengerBot R **v0.7.29a**가 넘겨주는 `room`은 방 이름이 아니라 안드로이드 알림
  제목이고, 운영 중인 오픈채팅에서는 그게 **말한 사람의 대화명**입니다. 한 방에서
  5명이 말하면 `room` 값이 5개로 갈립니다.
- `isGroupChat`은 오픈채팅 메세지에도 `false`로 옵니다.
- 이 버전에는 `BotManager` / `Event` API가 없어 `channelId`를 얻을 수 없습니다.
  (`ReferenceError: "BotManager" is not defined`)

그래서 방 분리는 **사람이 지키는 규약**입니다: 해빛스쿨은 `!`, 해피닥터는 `~`.

따라오는 결과를 알고 운영하세요:
- 다른 방에서 `!오늘`을 치면 해빛스쿨 기록이 그 방에 표시됩니다.
- 다른 방에서 `!연결 <코드>`도 기술적으로는 동작합니다. 코드 자체가 신원을 증명하므로
  (앱에서 본인이 발급, 10분, 1회용) 남의 계정을 가져가려면 그 코드를 봐야 합니다.

`room` 값으로 뭔가를 막으려는 코드를 추가하지 마세요. 동작하지 않습니다.
안정적인 방 식별자가 필요하면 MessengerBot 버전부터 확인해야 합니다.

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
| `!연결 코드` / `!등록 코드` | 앱 계정 연결 (앱 프로필에서 만든 8자리 코드) |
| `!연결 해제` | 앱 계정 연결 끊기 |
| `!내코드` | 친구 코드 확인 |
| `!친구 코드` | 친구 추가 |
| `!해빛` | 해빛스쿨을 3분 안에 이해할 수 있는 소개 영상 |
| `!명상` | 명상과 호흡법 설명·실습 영상 |
| `!해빛기록` / `!하루기록` | 로그인 없이 볼 수 있는 내 하루 기록 공유 링크 |
| `!해빛영상` | 어제와 오늘의 공개 사진·운동 영상·감사일기를 묶는 영상 |
| `!영상추천` / `!추천영상` / `!유튜브추천` | 외부 유튜브 롱폼 플레이리스트에서 아직 추천하지 않은 최신 영상 |
| `!식단` | 식단 현황 + AI 코칭 |
| `!운동` | 운동 현황 + AI 코칭 |
| `!마음` | 수면/감사/명상 현황 + AI 코칭 |

일반 질문도 해빛코치가 답변합니다.

---

## 단톡방 개인정보 처리

habitschool 저장소의 방침과 일치해야 합니다. 벗어나는 변경은 방침을 먼저 고쳐야 합니다.

수집하는 것:
- 입력한 명령어
- 카카오톡 표시 이름(대화명)

> 방침에 있던 "명령을 입력한 채팅방 이름"은 **수집할 수 없습니다.** `room` 자리에 방
> 이름이 아니라 대화명이 들어오기 때문입니다. 방침에서 이 항목을 빼야 합니다.

지키는 것:
- `!`로 시작하지 않는 메세지는 스크립트가 서버로 보내지 않습니다.
- 대화명은 앱 계정 연결 목적으로만 사용합니다.
- 연결하지 않은 상태로 `RETENTION_DAYS`(기본 30일)가 지난 데이터는 자동 삭제합니다
  (`modules/retention.js` + `index.js`의 일일 스케줄러).
- 단톡방 경로에서는 습관 키워드를 저장하지 않습니다. 방침이 "입력한 명령어"만
  수집한다고 적혀 있으므로, 자유 문장에서 키워드를 뽑아 저장하던 동작은 제거했습니다.
- 제출된 연결 코드는 응답에도 로그에도 남기지 않습니다(`<redacted>`).
- 단톡방 응답에는 연결된 이메일을 표시하지 않습니다. 방은 여러 명이 봅니다.

### 알려진 한계 — 대화명은 안정적인 식별자가 아닙니다

`sender`는 표시 대화명이며 계정 식별자가 아닙니다. 연결 시점에는 코드가 신원을
증명하므로 안전하지만, 이후 조회는 대화명으로 이뤄집니다.

- 대화명을 바꾸면 매칭이 끊깁니다. 같은 계정으로 `!연결 코드`를 다시 입력하면 연결이
  새 대화명으로 **옮겨지고** 옛 매핑은 정리됩니다(`previousIdentityKey`에 기록).
- 같은 대화명을 쓰는 사람이 둘이면 섞일 수 있습니다. 이미 연결된 대화명에 새 연결이
  들어오면 조용히 덮어쓰지 않고 거부합니다.
- 서버는 "대화명을 바꾼 사람"과 "처음 온 사람"을 구분할 수 없으므로, 안내 문구는 둘 다
  참인 표현만 씁니다.

이 가정은 `modules/chatLink.js` 한 곳에 모여 있습니다. 안정 식별자로 옮길 때 바꿀
경계는 이 모듈입니다.

### 연결 실패 사유

앱이 코드를 소비할 때 `chatbotLinkCode` 필드를 삭제하므로, **이미 사용한 코드와 존재한
적 없는 코드는 구분할 수 없습니다.** 둘 다 `not_found`로 합쳐 안내합니다.

| 사유 | 뜻 |
|---|---|
| `invalid_format` | 8자리 형식이 아님 |
| `expired` | 코드가 만료됨 |
| `not_found` | 없는 코드이거나 이미 사용한 코드 |
| `nickname_already_linked` | 이 대화명에 이미 연결된 계정이 있음 |
| `unavailable` | 앱 데이터베이스에 접근할 수 없음 |

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
