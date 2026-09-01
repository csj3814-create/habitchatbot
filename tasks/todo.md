# 2026-08-15 모델 내부 스캐폴딩이 단톡방에 노출되던 문제
> Status: Completed

## 증상

회원 질문에 답할 때 답변 앞에 이런 게 그대로 붙어 나갔다. 200명이 있는 방에서.

```
tool_code
print(google_search.search(queries=['버터 건강 영향', ...]))
thought
The user is asking whether they should avoid butter...
```

## 원인

`gemini-2.5-flash`는 thinking이 기본 활성이고, 그 사고 과정이 별도 필드가 아니라
**본문 텍스트 앞에 붙어서** 오는 경우가 있었다. 챗봇은 `response.text()`를 그대로
방에 올렸다.

**재현이 안 됐다.** 같은 질문으로 6번 호출해도 전부 깨끗했다. 그래서 정규식으로
때려잡기 전에 원천 차단이 가능한지부터 확인했다.

## 조치 (3계층)

1. **원천** — `generationConfig.thinkingConfig.thinkingBudget = 0`.
   구형 SDK가 모르는 필드를 조용히 버릴 수 있어서 실제로 먹는지 측정했다:
   `thoughtsTokenCount` **260 → 없음**. thinking이 없으면 유출될 thought도 없다.
   이 봇은 2~4문장 코칭을 하므로 사고 과정이 필요한 작업도 아니다.

2. **경계** — `sanitizeModelText()`를 `utils/gemini.js`에 추가하고
   `response.text()`를 읽는 4곳 전부에 적용
   (`routes/kakao.js` 2곳, `routes/messengerbot.js`, `commands/categoryHabits.js`).
   **맨 앞이 마커로 시작할 때만** 동작하므로 정상 답변은 다시 쓰지 않는다.

3. **프롬프트** — 내부 과정 출력 금지 + "해빛스쿨은 실제 서비스" 명시.
   유출된 thought 중 하나가 해빛스쿨을 `a fictional entity for this persona`로
   판단하고 있었고, 그 탓에 실제로 틀린 답을 만들고 있었다.

## Review

- `test/gemini-sanitize.test.js` 신설. **단톡방에서 실제로 유출된 문자열**을 그대로
  넣어 검증한다. 내가 지어낸 예시가 아니다.
- 작업 중 ``를 넣다가 파일에 **백스페이스 문자(0x08)**가 들어가 정규식이 조용히
  매칭에 실패했다. 테스트가 없었으면 "고쳤다"고 배포하고 아무것도 안 고쳐졌을 것이다.
- 검증: `npm test` 115 통과 / 0 실패, 실 API 4/4 깨끗(전부 `thoughtsTokenCount` 없음),
  배포 후 프로덕션 `/api/chat` 실측 2건 정상.

---

# 2026-08-15 단톡방 계정 연결 (`!연결 <코드>`)
> Status: Completed

## Tasks
- [x] 단톡방에서 `!연결 <코드>` / `!등록 <코드>` 수신
- [x] 만료 / 없는 코드 / 이미 연결됨을 각각 다른 안내로 구분
- [x] 대화명이 안정 식별자가 아니라는 전제로 충돌·이름변경 처리
- [x] 30일 보관 삭제 구현, 단톡방 경로의 습관 키워드 저장 제거
- [x] 방 필터 제거 및 운영 약속 문서화
- [x] 회귀 테스트 + 종단 검증

## 방 필터를 제거한 이유

원래 계획은 방 이름 허용목록(fail-closed)이었고 실제로 구현·검증까지 했지만,
**운영 로그를 보니 성립하지 않는 설계였습니다.**

MessengerBot R v0.7.29a가 넘기는 `room`은 안드로이드 알림 제목이고, 운영 오픈채팅에서는
그게 말한 사람의 대화명입니다. 한 방에서 5명이 말한 로그에 `room`이 릴리 / Lemon /
아버지 / 최석재… 로 갈렸습니다(그중 Lemon의 메세지는 "저에게 개톡주세요"라 명백히
단톡방 발언). `isGroupChat`도 오픈채팅에서 false로 오고, 이 버전엔 `BotManager`/`Event`
API가 없어 `channelId`도 없습니다(`ReferenceError: "BotManager" is not defined`).

즉 이 플랫폼 버전에서는 방을 식별할 수단이 하나도 없습니다. 사용자 결정에 따라 방 필터를
들어내고, **해빛스쿨은 `!` / 해피닥터는 `~`** 라는 운영 약속에 의존하기로 했습니다.

기존 스크립트의 `GROUP_ROOM_NAME`은 선언만 있고 한 번도 참조되지 않던 죽은 상수라
필터가 있는 것처럼 보이게 만들었습니다. 혼동을 없애려고 삭제했습니다.

## 남아 있는 위험 (수용됨)

- 다른 방에서 `!오늘` 등 공개 조회 명령이 동작합니다. `handleToday`는 매핑을 확인하지
  않으므로 해빛스쿨 기록이 다른 방에 표시될 수 있습니다.
- 다른 방에서 `!연결 <코드>`도 기술적으로 동작합니다. 코드가 신원을 증명하므로
  (앱 발급, 10분, 1회용) 실제 탈취에는 코드 자체를 봐야 합니다.

## Review

- `modules/chatLink.js` — "대화명이 유일 키"라는 가정을 가두는 단일 경계.
  `linkByCode` / `resolveLinkedAccount` / `buildUnlinkedMessage`.
- `consumeChatbotLinkCode`가 `{ok:true,user}` 또는 `{ok:false,reason}`을 반환.
  `not_found` / `expired` / `unavailable`을 구분합니다.
- 충돌 처리: 이미 연결된 대화명은 **코드를 소비하지 않고 거부**. 같은 앱 계정이 다른
  대화명에 있으면 연결을 **옮기고** 옛 매핑을 삭제(`previousIdentityKey` 기록).
- `registerUser`가 `linkedDisplayName` / `linkedAt` / `linkSource`를 저장.
- 인자 없는 `!연결`은 매직링크를 내보내지 않습니다. 방에 링크를 뿌리면 누구나 눌러
  발화자 대화명에 자기 계정을 붙일 수 있습니다.
- `commands/groupLink.js`가 단톡방 전용 문구를 1:1 문구와 분리합니다(1:1 쪽은 연결
  이메일을 출력하므로 그대로 쓰면 방에 노출됩니다).
- 연결 명령 인자는 로그에 `<redacted>`.
- 단톡방 경로의 `checkAndLogHabits` 제거. `!기록수`가 그 데이터의 유일한 독자여서 함께
  제거했고, `db`/`checkAndLogHabits`는 라우터 의존성에서 빠졌습니다.
- `modules/retention.js` + `index.js` 일일 잡. 미연결 `messengerbot:` 키와 만료된
  connect 토큰만 대상. 건수만 로그하고 대화명은 남기지 않습니다.

## 검증
- `npm test` 109 통과 / 0 실패
- 변경 파일 `node --check`
- 종단 검증 28/28: 실제 라우터 → 실제 커맨드 → 실제 매핑 저장까지, Firestore와 RTDB만
  대체. 앱이 쓰는 실제 `Timestamp.fromDate(...)` 형태로 만료/유효 코드를 넣었고,
  이름변경 이동·중복 거부·해제·`!등록` 별칭·방 무관 동작·보관 삭제까지 포함.

---

# 2026-08-15 `!공유`를 앱 갤러리 카드로 넘기고 서버 렌더러 제거
> Status: Completed

## 배경

챗봇이 자체 PNG를 렌더해 명령이 입력된 방에 이미지 URL을 올리던 방식이었다. 앱 갤러리
카드가 그보다 좋아졌다 — 회원이 템플릿과 대표 사진을 고르고, 완성된 이미지를 플랫폼
공유 시트로 넘겨 **원하는 아무 방이나 인스타에** 보낼 수 있다.

렌더러를 하나 더 유지한 대가:
- 카드 디자인이 앱과 따로 놀아 같이 바꿀 수 없음
- 이미지 토큰이 5분 만료라 나중에 다시 열면 죽은 링크
- 무료 인스턴스가 식어 있으면 그림 자체가 실패

## Tasks
- [x] `!공유`가 앱 갤러리 공유 카드 링크를 반환하도록 변경
- [x] 앱에 `focus=share` 딥링크 추가 (habitschool 저장소)
- [x] 카카오 1:1의 `!연결 <코드>` 누락 경로 수정
- [x] 참조가 사라진 서버 렌더러 일괄 제거
- [x] 남은 `share_card_tokens`를 보관 삭제 잡 대상에 추가

## 제거한 것

`utils/shareCardRenderer.js`, `test/share-card-renderer.test.js`,
`GET /api/share-card/:token.png`, `appFirebase`의 `getShareCardPayload` ·
`createShareCardToken` · `consumeShareCardToken` · `generateShareCardToken` ·
`SHARE_CARD_TOKEN_TTL_MS`, `kakaoTemplate`의 share 빌더 3개와 관련 테스트.

**남긴 것**: `sharp` · `fontkit` · Noto CJK 폰트는 `utils/haebitVideoRenderer.js`가
그대로 쓴다. `buildShareCardPayloadFromRecord`도 해빛 공유 페이지가 계속 쓴다.
지우기 전에 전수 검사로 확인했다.

RTDB `share_card_tokens`는 새로 생기지 않지만 기존 항목이 남아 있어,
`modules/retention.js`가 `chatbot_connect_tokens`와 같은 방식으로 만료분을 걷어낸다.

## 검증
- `npm test` 109 통과 / 0 실패
- 변경 파일 `node --check`
- 부팅 검사 13/13: 모든 모듈 로드, 라우터 2개 실제 구성, 삭제된 심볼이 export에서
  사라졌는지, 해빛 영상이 쓰는 export와 `sharp`/`fontkit`은 살아 있는지 확인

---

# 2026-08-15 링크 코드 만료 판정 버그 + 콜드 스타트 타임아웃
> Status: Completed

## Tasks
- [x] `chatbotLinkCodeExpiresAt`가 Firestore Timestamp라서 `new Date()` 파싱이 깨지던 문제 수정
- [x] 폰 스크립트 서버 타임아웃 15초 → 60초
- [x] 회귀 테스트 추가 후 전체 검증

## 배경

앱(`habitschool/functions/runtime.js:4835`)은 연결 코드 만료 시각을
`admin.firestore.Timestamp.fromDate(...)`로 씁니다. 그런데 이 저장소는
`new Date(expiresAt)`로 읽고 있었고, Timestamp 객체를 `new Date()`에 넣으면
Invalid Date가 나옵니다. 그래서 **방금 만든 유효한 코드도 전부 만료로 판정**됐고,
`!등록 <코드>`는 처음부터 한 번도 성공한 적이 없습니다. 오류 메시지가
"코드를 확인하지 못했어요"라는 일반 문구여서 원인이 드러나지 않았습니다.

타임아웃 쪽은 별개입니다. Render 유휴 인스턴스가 깨어나는 데 50초 이상 걸리는데
스크립트 타임아웃이 15초여서, 콜드 스타트마다 `SocketTimeoutException`으로 실패했습니다.
KST 01–07시에는 self-ping과 GitHub Actions keepalive가 둘 다 쉬기 때문에
그 시간대 테스트는 거의 항상 실패합니다.

## Review

- `modules/appFirebase.js`에 `toEpochMs()` 추가. Firestore `Timestamp`, 직렬화된
  `{seconds, nanoseconds}`, `Date`, epoch 숫자, ISO 문자열을 모두 받고 그 외에는 NaN.
  `consumeChatbotLinkCode`가 이걸 쓰도록 변경. 반환 계약은 그대로(사용자 객체 또는 null).
- `messengerbot_script.js`에 `SERVER_TIMEOUT_MS = 60000` 추가하고 하드코딩된 15000 대체.
- `test/link-code-expiry.test.js` 신설. **깨진 파싱(`new Date(timestamp)`가 NaN)을
  전제 조건으로 단언**하므로 조용히 회귀할 수 없습니다.
- `test/messengerbot-script.test.js`에 타임아웃 60초 이상 단언 추가.
- 검증: `npm test` 83 통과 / 0 실패(기존 77), 변경 파일 `node --check`,
  앱이 쓰는 실제 Timestamp 형태로 `consumeChatbotLinkCode` 직접 구동 7/7 통과.

## 배포 후 확인
- 카카오 1:1에서 앱 코드 발급 → `!등록 <코드>` → 연결 완료 문구가 나오는지
- 폰 스크립트 교체 필요(타임아웃은 폰에 있음)
- 새벽 01–07시 테스트는 keepalive가 쉬는 시간이라 여전히 느립니다. 낮에 확인하세요.

---

# 작업 로그 — 2026-03-23

## 완료된 작업

### PR #6 — 신규 멤버 온보딩 시스템
- [x] 단톡방 입장 시스템 메시지 감지 (`들어왔습니다` / `초대했습니다`)
- [x] 자동 환영 메시지 전송 (API 비용 0, 클라이언트 직접 reply)
- [x] 10초 후 자기소개 유도 메시지 (Java Thread)
- [x] `!안내` 명령어 추가 (`commands/guide.js`)
- [x] `routes/messengerbot.js`에 `!안내` 라우트 + 미등록 유저 AI 힌트
- [x] Merge conflict 해결 (rebase → `--theirs`/`--ours` 수정)

### PR #7 — index.js 모듈화 복원 + API 키 인증
- [x] PR #6에서 실수로 들어간 모놀리식 index.js → 모듈화 복원 (114줄)
- [x] `utils/apiKeyAuth.js` 신설 — `x-api-key` 헤더 검증 미들웨어
- [x] `routes/messengerbot.js`에 apiKeyAuth 적용
- [x] `messengerbot_script.js`에 `x-api-key` 헤더 추가
- [x] `modules/habitCheckers.js` 추가 — KST 날짜 유틸 포함

### 브랜치 / 동기화
- [x] 루트 폴더 origin/main 동기화 (14커밋 fast-forward)
- [x] 로컬 WIP stash 보관
- [x] 모든 머지된 브랜치 삭제 (로컬 + 원격)
  - `claude/mystifying-ramanujan`
  - `claude/tender-nobel`
  - `feat/messengerbot-api-key-auth`
- [x] Worktree 정리

## 현재 상태
- `main` 브랜치 = 최신 (c4b0be1)
- 활성 브랜치: `main` 하나만
- 미완료 stash: `WIP: rate-limit + API키 인증 + habitCheckers + session TTL 개선`
  → 대부분 PR #7에서 반영됨, 나머지는 추후 검토

---

# 작업 로그 — 2026-03-24

## 완료된 작업

### 핫픽스 — !안내 메세지 gmail.com 링크 제거
- [x] `commands/guide.js` 14번째 줄: `이메일@gmail.com` → `구글 이메일` 변경
  - 메신저봇이 `@gmail.com` 문자열을 이메일로 인식해 하단에 링크를 자동 추가하는 현상 방지
- [x] 커밋 `c4b0be1` → `origin/main` 푸시 완료
- `messengerbot_script.js` 변경 없음 (환영 메세지에 gmail.com 형식 없음, 정상)

---

# 작업 로그 — 2026-03-26

## 완료된 작업

### 신규 멤버 온보딩 디버깅 — 오픈채팅봇 트리거 방식으로 변경
- [x] 원인 진단: 오픈채팅방에서 "OOO님이 들어왔습니다" 시스템 메세지가 메신저봇R에 수신 안 됨
- [x] 대안 채택: 카카오 오픈채팅봇(sender="오픈채팅봇") 환영 메세지를 트리거로 사용
- [x] `GROUP_ROOM_NAME`: `"해빛스쿨 - 습관을 바꿔라 (Dr.최석재와 함께)"` → `"최석재"` (실제 방 식별 이름)
- [x] 신규 멤버 감지 조건 변경: `msg.indexOf("들어왔습니다")` → `sender === "오픈채팅봇"`
- [x] 환영 메세지 제거 (오픈채팅봇이 이미 처리), 10초 후 자기소개 유도만 남김
- [x] 추가 수정: `isGroupChat &&` 조건 제거 — 오픈채팅봇 메세지가 `isGroupChat=false`로 수신됨
- [x] 커밋 `0d58f66`, `f8c2b10` → `origin/main` 푸시 완료

### 미해결
- [x] 하루 4회 브로드캐스트 운영 방향 확정
  - 현재 이 저장소 기준 자동 아침/점심/저녁/밤 브로드캐스트 기능은 제거됨 (`README.md`와 구현 현황 확인).
  - 결정: 이 저장소에서는 브로드캐스트를 다시 구현하지 않고, 카카오 오픈채팅봇 예약 메시지 + `!오늘` 자동 응답 흐름으로 운영한다.
  - 운영 메모: 환영 메시지는 오픈채팅봇의 실제 환영 문구에만 반응하고, 밤 예약 메시지는 첫 줄 `!오늘`로 통계를 띄운다.

## 현재 상태
- `main` 브랜치 = 최신 (`f8c2b10`)
- 앱 스크립트 교체 후 테스트 중 (자기소개 유도 메세지 동작 확인 필요)
# 2026-04-04 Chatbot Friend Flow Polish
> Status: Completed

## Tasks
- [x] Remove chatbot-wide friend count limit from `!친구`
- [x] Add minimal command tests for `!등록` and `!친구`
- [x] Run syntax checks and `npm test`

## Review
- `commands/addFriend.js` no longer blocks requests based on total friend count and now reports current friend count without a `/3` style cap.
- Added `test/commands.test.js` and switched `package.json` to `node --test`.
- Verification passed: `node --check commands/addFriend.js`, `node --check commands/register.js`, `node --check test/commands.test.js`, `npm test`.

# 2026-04-05 Chatbot Share Command
> Status: Completed

## Tasks
- [x] Add `!공유` command flow with account mapping and shareable-log lookup
- [x] Render a share-card PNG and expose it through a short-lived token route
- [x] Connect Kakao/MessengerBot responses and add minimal tests

## Review
- Added `commands/share.js`, `utils/shareCardRenderer.js`, and `GET /api/share-card/:token.png` so chatbot users can generate a tokenized share-card image from their latest shareable log.
- Extended `modules/appFirebase.js` with share payload, privacy-rule, and token helpers aligned to the Habits School app guide.
- Connected `!공유` in both `routes/kakao.js` and `routes/messengerbot.js`, and updated `utils/kakaoTemplate.js` plus `commands/guide.js` for discovery.
- Verification passed: `node --check index.js`, `node --check modules/appFirebase.js`, `node --check routes/kakao.js`, `node --check routes/messengerbot.js`, `node --check utils/kakaoTemplate.js`, `node --check utils/shareCardRenderer.js`, `node --check commands/share.js`, `node --check commands/guide.js`, `node --check test/commands.test.js`, `npm test`, and a sample `renderShareCardPng()` execution returning a valid PNG buffer.

# 2026-04-05 Chatbot Magic-Link Connect Flow
> Status: Completed

## Tasks
- [x] Add `!연결` command for Kakao-first account linking
- [x] Add chatbot connect token APIs for the Habits School app
- [x] Write handoff documentation for the app repo and re-run verification

## Review
- Added `commands/connect.js` and `modules/chatbotConnect.js` so `!연결` now issues a short-lived app deep link instead of forcing copy/paste.
- Added `GET /api/chatbot-connect/:token` and `POST /api/chatbot-connect/complete` in `index.js`, including CORS for the Habits School web app and Firebase ID-token verification.
- Updated help/register messaging so `!연결` is the default path and `!등록 코드` remains as fallback only.
- Wrote the app-side implementation guide at `C:\SJ\antigravity\habitschool\tasks\해빛코치_매직링크_계정연결_가이드.md`.
- Verification passed: `node --check index.js`, `node --check modules/chatbotConnect.js`, `node --check modules/appFirebase.js`, `node --check commands/connect.js`, `node --check commands/register.js`, `node --check commands/guide.js`, `node --check routes/kakao.js`, `node --check routes/messengerbot.js`, `node --check utils/kakaoTemplate.js`, `node --check test/commands.test.js`, `npm test`.
# 2026-04-05 Invite Link Friend UX
> Status: Completed

## Tasks
- [x] Make `!내코드` return the full invite link plus fallback friend code
- [x] Reframe `!친구` as the manual fallback while keeping the 3-day pending request flow
- [x] Write the Habits School app handoff doc for `?ref=` signup-plus-friend behavior
- [x] Re-run syntax checks and command tests

## Review
- Rewrote `commands/addFriend.js` so the primary social CTA is now the invite link `https://habitschool.web.app/?ref=<code>`, while `!친구 코드` stays available as the manual fallback.
- Updated `commands/guide.js` so onboarding/help text points users to `!내코드` for sharing and explains the invite-link-first flow.
- Added `C:\SJ\antigravity\habitschool\tasks\초대링크_추천_친구연결_가이드.md` with exact app-side rules for 신규 회원 추천+친구 연결 and 기존 회원 친구 연결 only.
- Verification passed: `node --check commands/addFriend.js`, `node --check commands/guide.js`, `node --check test/commands.test.js`, `npm test`.
# 2026-04-07 Group Chat Connect Guard
> Status: Completed

## Tasks
- [x] Confirm how `!연결` is exposed in shared MessengerBot rooms
- [x] Block `!연결` and `!등록` in group chats so auth links/codes are never posted there
- [x] Update onboarding copy to emphasize 1:1-only account linking
- [x] Re-run syntax checks and tests

## Review
- Rewrote `routes/messengerbot.js` so shared rooms immediately return a direct-chat-only warning for `!연결` and `!등록`, while keeping the rest of the command flow unchanged.
- Rewrote `commands/connect.js` and `commands/guide.js` with explicit 1:1 security guidance and a reusable `buildDirectChatOnlyMessage()` helper.
- Expanded `test/commands.test.js` with a dedicated assertion for the direct-chat-only warning.
- Verification passed: `node --check commands/connect.js`, `node --check commands/guide.js`, `node --check routes/messengerbot.js`, `node --check test/commands.test.js`, `npm test`.

# 2026-04-07 Open Chat 1:1 Guidance
> Status: Completed

## Tasks
- [x] Re-check the shared-room connect guard and confirm it did not yet tell users how to reach the private 1:1 window
- [x] Update the direct-chat-only warning and onboarding copy with concrete Kakao navigation steps
- [x] Re-run syntax checks and command tests

## Review
- Updated `commands/connect.js` so the shared-room warning now tells users to open KakaoTalk home, search for `해빛코치`, start a 1:1 chat, and then run `!연결`.
- Updated `commands/guide.js` so onboarding and app help use the same concrete 1:1 navigation instead of only saying "use 1:1."
- Verification passed: `node --check commands/connect.js`, `node --check commands/guide.js`, `node --check test/commands.test.js`, `npm test`.

# 2026-04-07 Direct Kakao 1:1 Link
> Status: Completed

## Tasks
- [x] Find the actual �غ���ġ Kakao channel URL already used by the product
- [x] Replace search-based 1:1 guidance with the direct channel chat link
- [x] Re-run syntax checks and command tests

## Review
- Confirmed the app already links to `https://pf.kakao.com/_QDZZX` in `C:\SJ\antigravity\habitschool\index.html`, and verified that `https://pf.kakao.com/_QDZZX/chat` responds.
- Updated `commands/connect.js`, `commands/guide.js`, and `commands/register.js` to point users to the direct 1:1 link instead of telling them to search manually.
- Verification passed: `node --check config.js`, `node --check commands/connect.js`, `node --check commands/guide.js`, `node --check commands/register.js`, `npm test`.

# 2026-04-07 MessengerBot Connect Lockdown
> Status: Completed

## Tasks
- [x] Confirm why open-chat `!����` still emitted a magic link after the first guard change
- [x] Change MessengerBot so `!����` and `!���` always return direct 1:1 guidance instead of account-link payloads
- [x] Add a route-level test proving the block still applies when `isGroupChat=false`

## Review
- Rewrote `routes/messengerbot.js` so MessengerBot never handles account linking directly and always responds with `buildDirectChatOnlyMessage()` for `!����` and `!���`.
- Added `test/messengerbot-route.test.js` to verify that both commands are blocked even when the incoming payload says `isGroupChat: false`.
- Verification passed: `node --check routes/messengerbot.js`, `node --check test/messengerbot-route.test.js`, `npm test`.

# 2026-04-07 Connect Warning Copy Trim
> Status: Completed

## Tasks
- [x] Trim the direct-chat warning down to the exact user-requested copy
- [x] Update the connect warning test to match the shorter copy
- [x] Re-run syntax checks and tests

## Review
- Reduced `buildDirectChatOnlyMessage()` to the exact three-part warning the user requested: short block notice, direct 1:1 link, and `!����` instruction only.
- Updated `test/commands.test.js` so the warning must include the direct Kakao link and must not mention `!���`.
- Verification passed: `node --check commands/connect.js`, `node --check test/commands.test.js`, `npm test`.
# 2026-04-07 App Entry URL In Help Copy
> Status: Completed

## Tasks
- [x] Review existing `!앱` / `!도움말` copy and the project lessons for messaging constraints
- [x] Rewrite `commands/guide.js` so the help copy says the Habits School app is a web app at `https://habitschool.web.app`
- [x] Keep the guide/app messages shorter and more skimmable for KakaoTalk
- [x] Add or update tests for the new help copy
- [x] Re-run syntax checks and tests

## Review
- Rewrote `commands/guide.js` so both `!도움말` and `!앱` now start with the Habits School web-app entry URL `https://habitschool.web.app`, tell users to log in there first, and keep the connect flow to a short `1:1 -> !연결` path.
- Trimmed the copy so KakaoTalk shows only the core steps and the most-used commands instead of long explanatory paragraphs.
- Added guide-copy assertions to `test/commands.test.js`.
- Verification passed: `node --check commands/guide.js`, `node --check test/commands.test.js`, `npm test`.
# 2026-04-07 Fast Help Command Path
> Status: Completed

## Tasks
- [x] Reproduce why `!앱` / `!도움말` felt slow on the Kakao route
- [x] Move fixed-command handling ahead of habit logging and Gemini session setup
- [x] Add an explicit Kakao `!앱` command route
- [x] Add a route test proving help commands do not call logging or Gemini
- [x] Re-run syntax checks and tests

## Review
- Found two root causes in `routes/kakao.js`: the route awaited `checkAndLogHabits()` before command dispatch, and `!앱` had no explicit Kakao handler so it could fall through to Gemini.
- Updated `routes/kakao.js` so fixed commands like `!앱`, `!안내`, `!가이드`, and `!도움말` return before any habit logging or Gemini session creation.
- Added `test/kakao-route.test.js` to lock in the fast path and ensure those commands never touch logging or model code.
- Verification passed: `node --check routes/kakao.js`, `node --check test/kakao-route.test.js`, `npm test`.
# 2026-04-07 Scheduled Render Keepalive
> Status: Completed

## Tasks
- [x] Confirm the remaining `!앱` / `!도움말` delay was cold-start latency, not command routing
- [x] Add a scheduled external ping that runs every 14 minutes and skips KST dawn hours
- [x] Make in-process self-ping follow the same KST sleep window
- [x] Add unit tests for the KST sleep-window logic
- [x] Re-run syntax checks and tests

## Review
- Measured the live service and confirmed the pattern was cold start: first request was slow, then warm requests returned in under 200ms.
- Added `.github/workflows/render-keepalive.yml` to ping Render every 14 minutes and skip the default KST sleep window of 01:00-07:00.
- Added `utils/selfPingWindow.js` and updated `index.js` / `config.js` so in-process self-ping also sleeps during the same KST hours.
- Verification passed: `node --check index.js`, `node --check config.js`, `node --check test/self-ping-window.test.js`, `npm test`.
# 2026-04-08 Kakao App Card And Help Quick Replies
> Status: Completed

## Tasks
- [x] Review current Kakao `!앱` / `!도움말` response flow and tests
- [x] Add a Kakao app-card response with direct web-app CTA and follow-up action buttons
- [x] Strengthen Kakao help quick replies for the most common next taps
- [x] Update route tests to lock in the new response shape
- [x] Re-run syntax checks and tests

## Review
- Added Kakao-only response builders so `!앱` now returns a basic card centered on app usage with `앱 열기` and `갤러리 보기` buttons.
- Switched Kakao `!도움말` / `!안내` / `!가이드` aliases to a guide response with action-first quick replies: `!앱`, `!연결`, `!오늘`, `!내습관`.
- Added `test/kakao-template.test.js` and updated `test/kakao-route.test.js` to lock in the new response shape.
- Verification passed: `node --check utils/kakaoTemplate.js`, `node --check routes/kakao.js`, `node --check test/kakao-route.test.js`, `node --check test/kakao-template.test.js`, `npm test`.
# 2026-04-08 Keepalive Cadence Buffer
> Status: Completed

## Tasks
- [x] Verify the latest deployment state and live `!앱` response shape
- [x] Check the recent keepalive workflow run history for missed margins
- [x] Reduce keepalive cadence from 14 minutes to 10 minutes to absorb scheduler drift
- [x] Re-run validation and tests

## Review
- Verified the latest Kakao `!앱` deployment is live and currently returns the app card.
- Found that recent GitHub scheduled runs had large gaps, so a 14-minute cadence was too close to Render's 15-minute idle cutoff.
- Updated `.github/workflows/render-keepalive.yml` to `*/10 * * * *` and changed the in-process default in `config.js` to 10 minutes as well.
- Verification passed: `node --check config.js`, `npm test`.
# 2026-04-08 App Guidance Focus Shift
> Status: Completed

## Tasks
- [x] Confirm the current `!앱` / `!도움말` copy over-emphasizes 1:1 connection
- [x] Rewrite app/help guidance so the main message is how to use the Habits School web app
- [x] Replace Kakao `!앱` card actions to focus on app usage instead of 1:1 connection
- [x] Update tests for the new copy and response shape
- [x] Re-run tests and deploy

## Review
- Re-focused `!앱` / `!도움말` copy so the primary message is the Habits School web app flow, while 1:1 linking stays secondary and task-specific.
- Updated the Kakao `!앱` card follow-up action away from 1:1 linking and toward app usage, which matches the later live response with `앱 열기` and `갤러리 보기`.
- Verification was captured in the 2026-04-09 closeout: the revised guide copy shipped, the live Kakao response was checked, and the app card buttons were confirmed.
# 2026-04-09 Session Closeout
> Status: Completed

## Completed Today
- [x] Deployed Kakao `!앱` app-card response and fixed the default-argument runtime bug
- [x] Deployed Kakao `!도움말` quick replies and verified the live response shape
- [x] Tightened Render keepalive from 14 minutes to 10 minutes to reduce cold-start risk
- [x] Refocused `!앱` / `!도움말` guidance on Habits School web-app usage instead of 1:1 linking
- [x] Verified the live Kakao `!앱` response shows `앱 열기` and `갤러리 보기` buttons

## Notes
- Kakao skill now uses the web-app-first guidance and card UI.
- MessengerBot remains text-only by design; it does not render Kakao basic cards.
- Left unrelated local changes in `README.md`, `messengerbot_script.js`, and `AGENTS.md` untouched.

# 2026-04-09 Task Log Cleanup And Next Actions
> Status: Completed

## Tasks
- [x] Reconcile stale 2026-04-08 checklist items with the 2026-04-09 closeout
- [x] Reclassify the old MessengerBot broadcast item as an operations/platform decision instead of an in-repo implementation task
- [x] Choose the broadcast path: keep it removed in-repo and operate through 카카오 예약 메시지 + `!오늘`
- [x] Close the item without new implementation because the chosen path is operational, not code-based

## Review
- Confirmed `README.md` already states that automatic morning/lunch/dinner/night broadcasts were removed from this repository.
- Confirmed there is no active in-repo broadcast scheduler code left to finish.
- Closed the remaining item with the chosen operating model: keep broadcasts out of this repo, use the open-chat-bot reservation feature, and reserve chatbot behavior for `!오늘` plus welcome-message filtering.

# 2026-04-09 Open Chat Bot Welcome Filter
> Status: Completed

## Tasks
- [x] Confirm whether MessengerBot R can see `오픈채팅봇` posts separately from Kakao's hidden system join messages
- [x] Narrow the onboarding trigger so only open-chat-bot welcome/join copy gets the follow-up greeting
- [x] Allow open-chat-bot command posts such as `!오늘` to reach the chatbot server instead of being swallowed by the welcome branch
- [x] Add verification that welcome posts, scheduled `!오늘` posts, and unrelated announcements now split correctly

## Review
- Confirmed the hidden Kakao system join line is still not visible to MessengerBot R, but posts from sender `오픈채팅봇` are visible and already being used as the onboarding trigger.
- Updated `messengerbot_script.js` so only welcome/join-flavored open-chat-bot messages trigger the delayed greeting, while open-chat-bot command posts like `!오늘` are forwarded to the server.
- Added `test/messengerbot-script.test.js` to lock in three cases: welcome copy triggers onboarding only, scheduled `!오늘` posts call the server, and unrelated open-chat-bot announcements are ignored.

# 2026-04-10 Simple App Help Link
> Status: Completed

## Tasks
- [x] Review current `!앱` / `!도움말` help copy and Kakao app-card link targets
- [x] Update help/app guidance to point to the simple app URL `https://habitschool.web.app/simple/`
- [x] Align the Kakao `!앱` card primary button with the same simple app URL
- [x] Update tests and re-run verification

## Review
- Updated `commands/guide.js` so `!도움말` / `!앱` copy now introduces the `심플형 앱` entry URL `https://habitschool.web.app/simple/`.
- Updated `utils/kakaoTemplate.js` so the default Kakao `!앱` card opens the same simple app URL and labels the card as `해빛스쿨 심플형 앱`.
- Verification passed: `node --check commands/guide.js`, `node --check utils/kakaoTemplate.js`, `node --check test/commands.test.js`, `node --check test/kakao-template.test.js`, `npm test`.

# 2026-04-10 Concise Simple App Guidance
> Status: Completed

## Tasks
- [x] Re-check whether the simple app already contains a built-in path to the basic app before adding more CTA copy
- [x] Shorten `!도움말` / `!앱` guidance so it leads with the simple app and only the core chatbot commands
- [x] Shorten the Kakao `!앱` card description to the same product framing
- [x] Update tests and re-run verification

## Review
- Removed the extra linking and feature-explainer lines from `commands/guide.js` so the chatbot now points users to the simple app first and keeps only the key command list.
- Shortened the default Kakao app-card description in `utils/kakaoTemplate.js` to match the same concise onboarding message.
- Verification passed: `node --check commands/guide.js`, `node --check utils/kakaoTemplate.js`, `node --check test/commands.test.js`, `node --check test/kakao-template.test.js`, `npm test`.

# 2026-04-12 Kakao BasicCard Thumbnail Fix
> Status: Completed

## Tasks
- [x] Confirm the Kakao `!연결` and `!앱` response builders still emit `basicCard` without `thumbnail.imageUrl`
- [x] Add a shared public HTTPS thumbnail URL to the Kakao connect/app card builders
- [x] Add tests that fail if either card loses `basicCard.thumbnail.imageUrl`
- [x] Run syntax checks and the Kakao template test suite

## Review
- Added a shared Kakao card thumbnail default in `utils/kakaoTemplate.js` using the public HTTPS asset `https://habitschool.web.app/icons/og-image.png`.
- Updated both `buildKakaoAppCardResponse()` and `buildKakaoConnectCardResponse()` so their `basicCard` payloads now include `thumbnail.imageUrl`, matching Kakao's schema requirement.
- Extended `test/kakao-template.test.js` to assert thumbnail presence for both the app card and connect card so the regression is caught locally.
- Verification passed: `node --check utils/kakaoTemplate.js`, `node --check test/kakao-template.test.js`, `node --test test/kakao-template.test.js`, `npm test`.

# 2026-04-15 Student Honorific Fix
> Status: Completed

## Tasks
- [x] Find where AI replies are being primed to call the user `코치님`
- [x] Change the prompt so Habits School users are treated as students and addressed as `이름+님` by default
- [x] Add a small regression test and run verification

## Review
- Found two priming points that could push the model toward the wrong honorific: `utils/gemini.js` said users may call the bot `코치님` without forbidding the reverse, and both AI routes only said to call the user by name "naturally."
- Added `utils/addressing.js` so Kakao and MessengerBot now treat the user as a Habits School student, default to `이름+님`, and explicitly forbid `코치님` / `선생님`. The helper also strips trailing `코치`-style titles from the name before building the AI prompt.
- Updated `utils/gemini.js` so the system instruction explicitly says the user is a student and replaced the default starter history that previously used `안녕 코치님!`.
- Verification passed: `node --check utils/addressing.js`, `node --check utils/gemini.js`, `node --check routes/kakao.js`, `node --check routes/messengerbot.js`, `node --test test/addressing.test.js`, `npm test`.

# 2026-04-20 Step-by-Step Help Flow
> Status: Completed

## Tasks
- [x] Review the current `!도움말` copy and identify why the participation flow is unclear
- [x] Rewrite `!도움말` as a numbered onboarding flow with link, login, install, and first-record steps
- [x] Update tests and re-run verification

## Review
- Rewrote `commands/guide.js` so `!도움말` now guides first-time participation in four explicit steps: entry link, Google login, app install, and daily habit recording.
- Kept `!앱` as the shorter summary command so the main onboarding help and the quick app pointer now serve different roles.
- Updated `test/commands.test.js` to lock in the new numbered onboarding copy and verified with `node --check commands/guide.js`, `node --check test/commands.test.js`, `node --test test/commands.test.js`, and `npm test`.

# 2026-04-21 Share Card Delivery And Design Fix
> Status: Completed

## Tasks
- [x] Inspect the current `!공유` response flow, image renderer, and app invite-link sources
- [x] Change `!공유` so Kakao shows the image first and follows with a natural invite link containing the caller's share code
- [x] Bundle a reliable Korean font and fix the share card text rendering
- [x] Redesign the share card layout for a cleaner poster-style result
- [x] Update tests, render a sample card, and verify the final response shape

## Review
- Added `utils/appLinks.js` and extended the share payload so `!공유` now carries the caller's own `?ref=` invite link and share code instead of only sending a gallery link.
- Reworked `utils/kakaoTemplate.js` so the Kakao share response now sends the generated card as a `simpleImage` first, then follows with a natural invite message containing the caller's share link. `routes/messengerbot.js` share formatting now includes the same invite link in text.
- Rebuilt `utils/shareCardRenderer.js` around bundled official Noto CJK Korean fonts and `fontkit` path rendering so Korean text no longer depends on server OS fonts. The card layout was refreshed into a cleaner poster-style composition with clearer header, stat pills, media grid, and quote panel.
- Updated share-related tests in `test/commands.test.js`, `test/kakao-template.test.js`, and added `test/share-card-renderer.test.js`. Verified with `node --check utils/appLinks.js`, `node --check commands/share.js`, `node --check utils/kakaoTemplate.js`, `node --check utils/shareCardRenderer.js`, `node --check modules/appFirebase.js`, `node --check routes/messengerbot.js`, and `npm test`.

# 2026-04-21 Share Card Square Thumbnail Follow-up
> Status: Completed

## Tasks
- [x] Remove the verbose subtitle line from the generated share card header
- [x] Rework the media layout so 1, 2, 3, and 4 thumbnails all render in square frames
- [x] Re-render and verify the updated share card output

## Review
- Removed the header subtitle from `utils/shareCardRenderer.js` so the card leads with the title, stat pills, and media only.
- Reworked the media panel into square-first layouts: one large square, two side-by-side squares, one large plus two stacked small squares, and a centered 2x2 square grid.
- Verification passed with `node --check utils/shareCardRenderer.js`, `node --test test/share-card-renderer.test.js`, and `npm test`.

# 2026-04-21 Kakao Share Message Split
> Status: Completed

## Tasks
- [x] Re-check how `!공유` is currently delivered in Kakao and whether image/link can be split
- [x] Change Kakao share flow so the first bot reply is image-only and the invite link is sent as a follow-up callback message
- [x] Add regression coverage for the split Kakao share flow and re-run verification

## Review
- Split the Kakao share builders in `utils/kakaoTemplate.js` into image-only and invite-only responses, while preserving the combined builder as a fallback path.
- Updated `routes/kakao.js` so `!공유` uses `callbackUrl` when available: the first response sends only the `simpleImage`, then a short follow-up callback sends the invite link text.
- Added coverage in `test/kakao-template.test.js` and `test/kakao-route.test.js` to lock in the two-step delivery shape. Verified with `node --check utils/kakaoTemplate.js`, `node --check routes/kakao.js`, `node --test test/kakao-template.test.js test/kakao-route.test.js`, and `npm test`.

# 2026-04-21 MessengerBot Share Message Split
> Status: Completed

## Tasks
- [x] Confirm why `!공유` in the open chat still arrives as plain text instead of an image-first flow
- [x] Change the MessengerBot webhook/script flow so the first bot message is only the share image URL and the invite copy is sent as a follow-up message
- [x] Add route/script regression tests and re-run verification

## Review
- Found that `routes/messengerbot.js` still flattened `!공유` into one long text reply, while `messengerbot_script.js` only sent a single `replier.reply(...)` message.
- Updated the MessengerBot route to return `reply + followups`, with the first reply set to the bare share image URL and the second message containing the invite link/share-code copy.
- Updated `messengerbot_script.js` to send follow-up messages after the primary reply, and added regression coverage in `test/messengerbot-route.test.js` and `test/messengerbot-script.test.js`. Verified with `node --check routes/messengerbot.js`, `node --test test/messengerbot-route.test.js test/messengerbot-script.test.js`, and `npm test`.

# 2026-05-26 Scheduled Best Records
> Status: Completed

## Tasks
- [x] Add previous-week and previous-month top-3 leaderboard aggregation from Habits School app records
- [x] Add chat commands for scheduled posts: `!지난주베스트` and `!지난달베스트`
- [x] Let OpenChatBot reservation messages forward those commands through MessengerBot
- [x] Update route/script/command tests
- [x] Document the operating schedule and verification result

## Plan Notes
- Server-side proactive Kakao room push is still out of scope for this repo. Use the existing production pattern: Kakao OpenChatBot scheduled message posts a command, MessengerBot forwards it, and this server replies with the summary.
- Weekly post should summarize the previous Monday-Sunday range when run Monday morning.
- Monthly post should summarize the previous calendar month when run on the 1st.

## Review
- Added `commands/bestRecords.js` for previous-week and previous-month top-3 summaries, using the same score rule as `!순위`: 식단 1 / 운동 1.5 / 마음 1.
- Added `getLeaderboardByDateRange()` in `modules/appFirebase.js` and wired `!지난주베스트`, `!주간베스트`, `!지난달베스트`, and `!월간베스트` through Kakao and MessengerBot routes.
- Updated `messengerbot_script.js` so OpenChatBot reservation messages can use `!지난주베스트`, `!지난주 베스트`, `!지난달베스트`, or `!월간베스트` and still send canonical commands to the server.
- Documented the operating schedule in `README.md`: every Monday morning first line `!지난주베스트`, every 1st morning first line `!지난달베스트`.
- Verification passed: `node --check` for changed JS files/tests and `npm test` (44 passed).

# 2026-06-01 Scheduled Best Auto-Post Follow-up
> Status: Completed

## Tasks
- [x] Check why scheduled weekly/monthly best posts did not appear automatically
- [x] Make server command parsing tolerate OpenChatBot reservation copy after the first command line
- [x] Add regression tests for multiline scheduled best commands
- [x] Re-run verification and document whether the phone MessengerBot script needs updating

## Plan Notes
- The server-side handler is live, so a missing automatic post is most likely in the OpenChatBot reservation message -> MessengerBot script -> server command extraction chain.
- The active phone script may still be older than the repo script; older scripts forwarded only `!오늘` reservations as a clean first-token command.

## Review
- Likely cause: automatic reservation messages included explanatory copy after the first command line, while older phone scripts only special-cased `!오늘`. That could forward `지난주베스트\n...` or `지난달베스트\n...` as one body, which the server previously did not match.
- Hardened `commands/bestRecords.js` so it resolves weekly/monthly best commands from the full body, first line, or first token.
- Added regression coverage for multiline scheduled messages in `test/commands.test.js` and `test/messengerbot-route.test.js`.
- Captured the correction in `tasks/lessons.md`.
- Verification passed: `node --check commands/bestRecords.js test/commands.test.js test/messengerbot-route.test.js`, `node --test test/commands.test.js test/messengerbot-route.test.js test/messengerbot-script.test.js`, and `npm test`.
- The MessengerBot phone script should still be updated in the Android app because the repo version canonicalizes `!지난주`, `!지난달`, `!주간베스트`, and `!월간베스트`; the server patch just makes the backend more forgiving.

# 2026-06-01 Best Records On Today Command
> Status: Completed

## Tasks
- [x] Reuse the existing nightly `!오늘` reservation trigger instead of adding more OpenChatBot reservation slots
- [x] Append previous-week best records when KST today is Monday
- [x] Append previous-month best records when KST today is the 1st
- [x] Add tests for Monday, first-of-month, and combined Monday+1st behavior
- [x] Re-run verification and deploy

## Plan Notes
- The phone MessengerBot script already forwards scheduled `!오늘`, so the safest change is server-side only.
- If a date is both Monday and the 1st, the `!오늘` response should include both previous-week and previous-month summaries.

## Review
- Updated `commands/today.js` so `!오늘` appends previous-week best records on KST Mondays and previous-month best records on KST day 1.
- If KST today is both Monday and the 1st, the response appends both summaries after the daily record summary.
- Updated `README.md` to document that the existing nightly `!오늘` reservation is enough; no additional OpenChatBot reservation slots are needed.
- Verification passed: `node --check commands/today.js test/commands.test.js`, `node --test test/commands.test.js`, and `npm test`.

# 2026-06-03 Leaderboard User Labels
> Status: Completed

## Tasks
- [x] Stop showing generic `참여자 N`/`사용자` labels in ranking-style outputs when an app account ID is available
- [x] Resolve display labels from chat mappings, app user profiles, email/account fields, then short UID fallback
- [x] Apply the label resolver to `!기록`, `!순위`, `!주간베스트`, and `!월간베스트`
- [x] Add regression tests and run verification

## Plan Notes
- Prefer names from chat mappings or app profile fields.
- If no name exists, show an account-style label such as email local-part or `ID <short uid>` rather than generic participant numbering.

## Review
- Added `modules/leaderboardLabels.js` to resolve leaderboard labels from app user profiles, chat mappings, account email local-parts, or short UID fallback.
- Added `getUserProfilesByIds()` and preserved more record-side identity fields in `modules/appFirebase.js`.
- Updated `commands/myHabits.js`, `commands/ranking.js`, and `commands/bestRecords.js` so linked-record and ranking-style outputs no longer fall back to generic labels.
- Verification passed: `node --check` for changed JS/test files, `node --test test/commands.test.js`, and `npm test` (50 passed).

# 2026-06-04 Haebit Public Share Gallery
> Status: Completed

## Tasks
- [x] Add a non-login public gallery page for one shareable daily habit record
- [x] Add persistent short public links created by the `!해빛` command
- [x] Make like, comment, diet, and exercise actions redirect to the Habits School login/app page
- [x] Wire `!해빛` through Kakao and MessengerBot routes
- [x] Add regression tests and update command documentation

## Plan Notes
- Reuse the existing app record/share settings logic so hidden diet, exercise, mind, identity, date, and point choices are respected.
- Keep `!공유` image-card behavior unchanged; `!해빛` should create a separate public page code instead of using the 5-minute image token.
- Store only the app uid, record date/id, sender key, and timestamps in Realtime Database; the page should fetch the current record and render only public share fields.

## Review
- Added `commands/haebit.js` so `!해빛` creates a public gallery link from the user's latest shareable daily record.
- Added persistent `haebit_share_tokens` records in Realtime Database and public page rendering in `index.js`.
- Added `utils/haebitSharePage.js` for a mobile-friendly public page; like, comment, diet, exercise, and record-start actions redirect to the Habits School app/login flow.
- Reused share settings so hidden identity, date, diet, exercise, mind, and points stay hidden; health metrics such as weight/glucose are not exposed on the public page.
- Wired `!해빛` and `!햇빛` through Kakao and MessengerBot routes and documented the command in `README.md`.
- Verification passed: `node --check modules/appFirebase.js utils/haebitSharePage.js`, targeted route/command/page tests, and `npm test` (58 passed).

# 2026-06-04 Haebit Short Public URL
> Status: Completed

## Tasks
- [x] Replace visible `/h/:token` links with shortest safe root-level share codes
- [x] Keep existing `/h/:token` route compatible during transition
- [x] Add public share lookup rate limiting
- [x] Update tests, docs, and lessons after the URL design correction

## Plan Notes
- A no-login public page still needs an identifier in the URL, but it should be a short public code, not something that looks like an account/auth token.
- Use an 8-character random base64url code for a shorter URL while retaining high guess resistance.

## Review
- `!해빛` now replies with `https://habitchatbot.onrender.com/<8-char-code>` instead of `/h/<token>`.
- `/h/:token` remains available as a compatibility alias, but new links use the root-level code route.
- Reduced Haebit share codes to 8 random base64url characters and added collision checks on creation.
- Added a 60 requests/minute limiter to public share page lookup routes.
- Captured the correction in `tasks/lessons.md`.
- Verification passed: `node --check commands/haebit.js modules/appFirebase.js index.js`, targeted route/command/page tests, and `npm test` (58 passed).

# 2026-06-18 Daily Record Video Montage
> Status: Completed

## Tasks
- [x] Confirm a Render-compatible FFmpeg runtime and safe remote media download limits
- [x] Build a vertical MP4 montage from the shared day's photos, exercise clips, and gratitude journal
- [x] Add a video endpoint and expose it from the public Haebit gallery
- [x] Add command/documentation support for creating or sharing the daily video
- [x] Add focused tests and render a local sample MP4

## Plan Notes
- Generate a 720x1280 H.264 MP4 with a server-synthesized original soundtrack and no copyrighted source music.
- Use short photo slides, trim uploaded exercise clips, and render the gratitude journal as a Korean text slide.
- Reuse the existing public share code and privacy-filtered payload; never expose hidden categories or health metrics.
- Download media with protocol, host, size, timeout, and count limits before passing local files to FFmpeg.

## Review
- Added `@ffmpeg-installer/ffmpeg` so Windows development and Render Linux deployment receive a bundled FFmpeg binary.
- Added `utils/haebitVideoRenderer.js` to create 720x1280 H.264 montages from up to six public media items, a Korean gratitude slide, intro, and outro.
- Remote inputs are limited to Firebase/Google Storage HTTPS hosts, 15 MB per image, 30 MB per video, and 30 MB final output; videos are trimmed to five seconds.
- Added `GET /v/:shareCode.mp4` with generation rate limiting and a 30-minute in-memory result cache.
- Added a `하루 영상` action to the public gallery and `!해빛영상`/`!하루영상` commands for Kakao and MessengerBot.
- Verified Korean typography visually from extracted intro and gratitude frames.
- Verification passed: syntax checks, focused command/route/page tests, real photo/video FFmpeg integration renders, and `npm test` (63 passed).

# 2026-06-18 Energetic Generated BGM
> Status: Completed

## Tasks
- [x] Generate an original energetic instrumental track matched to montage duration
- [x] Add fade-in/out and AAC muxing without using copyrighted source music
- [x] Verify the final MP4 contains a playable audio stream
- [x] Update video documentation and regression tests

## Plan Notes
- Synthesize the music locally from kick, snare, hi-hat, bass, and bright lead tones at 124 BPM.
- Keep uploaded exercise audio muted so the montage has one consistent soundtrack.

## Review
- Added a deterministic 124 BPM stereo soundtrack synthesized from kick, snare, hi-hat, bass, chords, and a bright lead melody.
- Added 0.7-second fade-in and 1.1-second fade-out, soft clipping, and AAC 128 kbps muxing into the final MP4.
- Source exercise audio remains muted so every montage has one consistent soundtrack.
- Sample audio measured about -2.2 dB peak and -19.4 dB RMS without clipping.
- Updated `!해빛영상` copy and `README.md` to describe the original energetic BGM.
- Verification passed: WAV structure test, real MP4 AAC-track assertions, focused command tests, and `npm test` (64 passed).

# 2026-06-18 Video Progress And Three-Day Story
> Status: Completed

## Tasks
- [x] Replace direct MP4 links with an immediate progress page and stage-based percentage
- [x] Build video payloads from the token date plus the previous two calendar days
- [x] Include balanced photos, exercise clips, and gratitude entries across the three days
- [x] Replace black media padding with branded date/category frames
- [x] Improve `!해빛영상` wait-time guidance and update tests

## Plan Notes
- The progress page should start generation asynchronously, poll status, and reveal the video only at 100%.
- Existing `/v/:shareCode.mp4` links remain compatible by redirecting to the progress page until a completed buffer exists.
- Each source record keeps its own share settings; hidden categories, identity, dates, points, and mind text must remain hidden.

## Review
- `!해빛영상` and `!하루영상` now return `/video/:shareCode`, which renders immediately and explains the expected 30-second to 2-minute wait.
- Added asynchronous start/status endpoints and stage-based progress from record loading through scene rendering, BGM creation, and final muxing.
- Existing direct `/v/:shareCode.mp4` links redirect to the progress page until the completed MP4 is available.
- Added three-calendar-day payload aggregation with per-record privacy settings, date-balanced media selection, and up to three dated gratitude slides.
- Replaced black photo/video padding with category-colored branded frames containing date, category, title, and Habits School story context.
- Captured the blank-generation-page and raw-letterbox corrections in `tasks/lessons.md`.
- Browser plugin was unavailable; system Chrome headless QA verified desktop 1280x900 and mobile 390x844 progress states, including visible percentage, status text, progress bar, and responsive preview.
- Verification passed: visual frame inspection, progress/job/page tests, real FFmpeg photo/video renders, and `npm test` (67 passed).

# 2026-06-22 Complete Three-Day Media And Gratitude Layout
> Status: Completed

## Tasks
- [x] Remove the nine-item position-based sampling that drops later exercise videos
- [x] Include all normal public media from each of the three dates in chronological order
- [x] Shorten photo/video scene durations dynamically to keep larger montages practical
- [x] Paginate full gratitude journals into centered, visually balanced cards
- [x] Add regression tests proving strength videos and full journal text are retained

## Plan Notes
- The selection was deterministic, not random, but favored early diet entries because each day's media array is diet-first.
- Keep a high defensive ceiling for malformed/excessive records, while including the complete media set produced by the normal app workflow.
- Preserve each record's share settings and hidden-date behavior.

## Review
- Root cause: selection was deterministic but capped at nine items and media arrays were diet-first, so later strength videos were omitted.
- Video payloads now collect each date's complete public media set in chronological order, with a defensive ceiling of 36 items for malformed/excessive records.
- Scene durations automatically scale from the normal 2.5-second photo/5-second video timing toward a roughly 62-second media budget when many sources exist.
- Long gratitude journals are preserved in full, split into approximately 120-character pages, and rendered in centered quote cards with date and page numbering.
- Updated creation guidance to a realistic `1~3분`, with a note that unusually large records may take longer.
- Captured both correction patterns in `tasks/lessons.md`.
- Visual QA confirmed the redesigned centered gratitude pages and natural word wrapping.
- Verification passed: strength-video retention, 30-item complete timeline, full journal reconstruction, real MP4 renders, and `npm test` (67 passed).

# 2026-06-25 Haebit Video Background Generation
> Status: Completed

## Tasks
- [x] Move `!해빛영상` / `!하루영상` so the chat command starts the video job in the background
- [x] Change the public video page to status/download only, without starting FFmpeg on page open
- [x] Disable public start-on-open behavior on `/video/:shareCode/start`
- [x] Update regression tests for the new flow
- [x] Run syntax checks, focused tests, full `npm test`, and rendered-page QA

## Plan Notes
- Current behavior starts generation from the browser by calling `/video/:shareCode/start`.
- The safer flow is `chat command -> server queues one background job -> page polls status -> completed page downloads `/v/:shareCode.mp4``.
- If the server has no active job or cached result, the page should tell the user to request `!하루영상` again instead of silently generating a new video.

## Review
- `handleHaebitVideo()` now queues the render job immediately after creating the share code, then returns a status/download link.
- The public page only polls `/video/:shareCode/status`; it no longer contains or calls `/video/:shareCode/start`.
- `/video/:shareCode/start` now returns an existing processing/ready status or 409 idle guidance, so opening a link cannot trigger FFmpeg.
- Browser QA passed on desktop and 390px mobile: the page was nonblank, showed 0% idle guidance, had no console errors, and contained no `/start` endpoint.
- Verification passed: syntax checks, focused command/page/renderer tests, and `npm test` (67 passed).
# 2026-06-26 Haebit Video Memory Reduction
> Status: Completed

## Tasks
- [x] Reduce `!하루영상` source window from recent 3 days to yesterday+today
- [x] Lower the defensive media cap so malformed or media-heavy records cannot create huge FFmpeg jobs
- [x] Update user-facing copy, progress page text, renderer progress text, README, and regression tests
- [x] Run syntax checks and focused/full tests

## Plan Notes
- Render reported a memory-limit restart after Haebit video generation was introduced.
- The expensive part is likely FFmpeg processing many downloaded photos/videos and keeping the generated MP4 buffer in memory, not the Firestore date lookup itself.
- Two days should preserve the “daily story” value while reducing media count, segment count, video duration, BGM length, temp files, and output buffer size.

## Review
- Video payloads now use the token date plus one previous calendar day, so `!하루영상` covers 어제와 오늘 instead of recent 3 days.
- Defensive media caps were reduced from 36 to 20 items, video/image download size limits were lowered, output size was capped at 35 MB, and completed video cache entries were reduced from 6 to 2.
- Remote media downloads now stream directly to temp files instead of buffering full images/videos in Node memory.
- Video clips now honor the dynamically shortened scene duration instead of always rendering 5 seconds.
- Verification passed: syntax checks, focused command/share/page/renderer tests, and `npm test` (67 passed).

# 2026-07-02 Daily YouTube Longform Recommendation
> Status: Completed

## Tasks
- [x] Add a YouTube playlist RSS parser and fetch helper
- [x] Implement daily recommendation selection with Realtime DB history
- [x] Append the recommendation to `!오늘`
- [x] Add `!영상추천` / `!유튜브추천` command routes
- [x] Add regression tests and run `npm test`

## Plan Notes
- The source is the provided YouTube playlist, not Habits School record media.
- Use playlist RSS instead of YouTube Data API.
- The scheduled open-chat flow should reuse the existing nightly `!오늘` reservation.

## Review
- Added direct `fast-xml-parser` dependency and RSS parsing for the configured YouTube playlist.
- `!오늘` now appends a daily YouTube recommendation after any weekly/monthly best-record sections.
- `!영상추천` and `!유튜브추천` now return the same recommendation directly in MessengerBot and Kakao.
- Added the live-room alias `!추천영상` so the command does not fall through to Gemini.
- Realtime DB history keeps date-level reuse and video-level "already recommended" skipping.
- Live RSS check returned 15 playlist videos and parsed the current latest item successfully.
- Verification passed: syntax checks, focused command/route tests, and full `npm test` (74 passed).

# 2026-07-28 YouTube Recommendation Playlist Update
> Status: Completed

## Tasks
- [x] Verify the new playlist RSS feed is reachable
- [x] Update the default recommendation playlist ID
- [x] Add a regression test for the configured default playlist
- [x] Run focused and full tests
- [x] Commit and push the playlist update

## Plan Notes
- New playlist: `https://www.youtube.com/playlist?list=PLdVWJNYK0Cg8`
- Render may still override this with `DAILY_YOUTUBE_PLAYLIST_ID` if that environment variable is set in the dashboard.

## Review
- Updated the default YouTube recommendation playlist from `PL5QXWTYoV_06Ui4wX9CcchtTeEb1Yky6w` to `PLdVWJNYK0Cg8`.
- Live RSS verification succeeded with 15 videos; latest parsed item was `xFCO2ukRjmM`.
- Added a config regression test so the default playlist ID stays pinned to the requested source.
- Verification passed: syntax checks, focused `test/commands.test.js`, and full `npm test` (75 passed).

# 2026-08-05 Static YouTube Command Links
> Status: Completed

## Tasks
- [x] Add fixed YouTube responses for `!명상` and `!해빛`
- [x] Preserve the old public record link behind a non-conflicting alias
- [x] Update Kakao and MessengerBot command routing
- [x] Update tests and README command table
- [x] Run focused and full verification

## Plan Notes
- `!명상` should send the meditation/breathing practice video: `https://youtu.be/dcftmD1qVDs`
- `!해빛` should send the 3-minute Haebit School explanation video: `https://youtu.be/kusU9zROdhc`
- The old no-login daily record link remains useful, so route it through `!해빛기록` and `!하루기록`.

## Review
- Added `commands/staticVideos.js` for deterministic meditation and Haebit intro YouTube responses.
- `!해빛`/`!햇빛` now sends the 3-minute Haebit School intro video, while the old public record gallery remains available as `!해빛기록`/`!하루기록`.
- `!명상` now sends the meditation and breathing practice video in both MessengerBot and Kakao routes.
- Kakao responses use the existing YouTube card builder, and tests cover short-link card conversion.
- Verification passed: syntax checks, focused command/route/template tests, and `npm test` (77 passed).
