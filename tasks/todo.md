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
- [ ] 하루 4회 브로드캐스트 (`schedule()`) — 메신저봇R 버전이 스케줄 기능 미지원
  - 대안 검토 필요: 메신저봇R 베타(BotStudio) 교체 또는 카카오 오픈채팅봇 예약 메세지 기능 활용

## 현재 상태
- `main` 브랜치 = 최신 (`f8c2b10`)
- 앱 스크립트 교체 후 테스트 중 (자기소개 유도 메세지 동작 확인 필요)
