# Lessons Learned

## 2026-03-23

### Git Rebase 시 --ours / --theirs 방향 주의
- **실수**: `git rebase origin/main` 중 충돌 해결할 때 `git checkout --theirs index.js` 사용
- **결과**: rebase에서 `--theirs`는 내 feature 브랜치의 커밋을 의미 → 모놀리식 index.js가 main에 들어감
- **올바른 규칙**:
  - rebase 중 `--ours` = 리베이스 대상(main/HEAD) ✅
  - rebase 중 `--theirs` = 내가 replay하려는 커밋 (feature)
  - merge 중에는 반대: `--ours` = 현재 브랜치, `--theirs` = 병합 대상
- **예방법**: 충돌 해결 후 반드시 `git diff HEAD..origin/main -- <file>` 로 의도한 방향인지 검증

### 루트 폴더 동기화 습관
- feature 브랜치 작업 중 main이 많이 앞서갈 수 있음
- 작업 시작 전 항상 `git fetch origin && git status` 로 로컬/원격 차이 확인
- 로컬 WIP 변경사항은 `git stash push -m "설명"` 으로 명시적 메시지와 함께 보관

### Worktree 브랜치 삭제 순서
- worktree가 살아있는 브랜치는 `git branch -d` 불가
- 반드시 `git worktree remove <path> --force` 먼저 → 그 다음 `git branch -d`
- 원격 삭제: `git push origin --delete <branch>`

### PR 작업 완료 후 정리 루틴
1. `git checkout main && git pull origin main`
2. `git worktree list` → 남은 worktree 제거
3. `git branch --merged main` → 머지된 로컬 브랜치 일괄 삭제
4. `git push origin --delete <merged-branches>`
5. `git stash list` → 오래된 stash 정리

## 2026-04-04

### Separate app repo assumption check
- Mistake: I assumed the Habits School app UI lived in this chatbot repository and added app-side profile UI here.
- Rule: Before editing app/frontend files for a cross-system feature, confirm whether the production app is in the same repository or a separate project/versioned codebase.
- Safer pattern: Split work into `chatbot-side changes in this repo` and `app-side changes in the app repo`, then implement each part only in the correct codebase.

### Social friendship must match the product rule, not the easiest data write
- Mistake: A one-way `friends` array update is easy to implement, but it does not satisfy a product flow where social challenges require both sides to recognize the friendship.
- Rule: When a social feature depends on mutual consent, model friendship as `request -> accept/decline -> active`, keep a dedicated source of truth like `friendships/{pairId}`, and treat `users.friends` as a cache only.
- Rollout rule: If legacy one-way friend data exists, reset or explicitly migrate it before turning on the new flow; do not mix old direct-array friendships with the new request/accept contract.

### Prefer one-tap product flows over copy-paste when app and chatbot can cooperate
- Mistake: I initially optimized the existing code-based linking flow instead of first asking whether the chatbot and app could complete the account connection through a direct handoff.
- Rule: For cross-system onboarding, check whether a bot-issued short-lived link plus in-app confirmation can replace manual copy/paste. If the app is logged in and both systems are under our control, default to `chat -> deep link -> in-app confirm` before settling on code entry UX.

### Shared invite links can serve both growth and social graph flows
- Mistake: I treated referral links and friend connections as separate UX paths even though the product already had a strong shared intent signal: one person explicitly sharing a personal invite link.
- Rule: When an app already has a durable personal invite link, evaluate whether that link should unify acquisition and social connection. For existing members, prefer `open link -> in-app confirm -> active friendship`; for new members, consider `signup attribution + friendship` in one flow if the consent signal is strong enough.

### Auth links and auth codes must never be emitted into shared rooms
- Mistake: I improved the one-tap connect flow, but I did not immediately re-check whether the transport channel was private. A short-lived auth link is still unsafe if the room itself is shared.
- Rule: Before shipping any login, registration, mapping, or account-link command, verify whether the response can appear in a group room. If yes, block the sensitive command there and require a direct 1:1 chat or an additional second-factor confirmation.

### Shared-room fallback messages must explain the next click path
- Mistake: After blocking `!연결` in shared rooms, I only told users to use a 1:1 chat and did not explain how to actually reach that 1:1 window from Kakao.
- Rule: When a secure command is blocked in a shared room, the warning must include the concrete navigation path to the private chat or channel window. "Use 1:1" alone is not enough if the platform flow is not obvious.

### Prefer the actual entry URL over procedural navigation when it already exists
- Mistake: I replaced an unsafe shared-room link with a safe but clumsy search instruction, even though the product already had a stable Kakao channel URL in the app.
- Rule: If a verified direct entry link already exists for the target flow, use that link in chatbot guidance instead of asking users to search or navigate manually.

### Do not trust MessengerBot's `isGroupChat` for account-link security
- Mistake: I assumed MessengerBot would reliably mark open chats as `isGroupChat=true`, then used that flag as the only gate for sensitive connect commands.
- Rule: In MessengerBot integrations, treat account linking and manual registration codes as unsafe in every room unless the transport is explicitly private and verified. Do not rely on `isGroupChat` alone for security decisions.

### Keep security warning copy as short as the user-requested interaction allows
- Mistake: I kept adding fallback and extra help text after the user had already provided the exact warning shape they wanted.
- Rule: When the user specifies the exact scope of a warning message, keep only that content unless extra text is required for correctness or safety.

### Fast command routes must bypass logging and model setup
- Mistake: I let fixed Kakao commands wait on `checkAndLogHabits()` before command routing, and I missed an explicit `!앱` route, so simple help messages became slow and could fall through to Gemini.
- Rule: In chat routers, handle deterministic commands like help/app/status before any logging, persistence, or model-session setup. Add route tests that prove `!앱` and `!도움말` do not call logging or Gemini code.

### Keepalive cadence needs margin over the platform sleep threshold
- Mistake: I matched the external keepalive almost exactly to Render's 15-minute idle cutoff. GitHub Actions schedule jitter left occasional gaps long enough for cold starts to return.
- Rule: When a host sleeps after N idle minutes, do not schedule keepalive at N-1. Leave several minutes of buffer for scheduler drift; for a 15-minute cutoff, prefer 10-minute cadence.

### App guidance should optimize for app usage, not the side workflow I just implemented
- Mistake: After adding a convenient `!연결` path, I let `!앱` guidance over-focus on 1:1 connection instead of the user's real goal: helping people use the Habits School web app well.
- Rule: For entry/help commands like `!앱`, center the primary product action. Mention account linking only as a secondary, task-specific step, and only when that command is explicitly about linking.

### Open-chat-bot onboarding triggers must use the real production welcome copy
- Mistake: I initially generalized the open-chat-bot welcome detector with broad keywords before confirming the exact production welcome message text.
- Rule: When a platform bot message is being used as a trigger, capture the real first-line production copy and match that concrete pattern before widening the detector. Prefer exact first-line matching over loose substring keywords when the goal is to react only to one specific automation message.

### Confirm existing in-app transition paths before proposing new CTA work
- Mistake: I suggested adding a simple-to-basic app transition CTA before confirming whether that path already existed in the app.
- Rule: Before proposing new onboarding or transition UI, verify whether the app already has that button or flow. If it already exists, prefer tightening external guidance copy instead of adding redundant navigation.

### Platform message-length limits must shape the final operating copy
- Mistake: I drafted reservation-message ideas before checking the real platform limit, and the final operating channel only allows about 30 characters.
- Rule: For bot automation or scheduled-message copy, confirm the channel's actual character limit first and optimize the final wording to fit the tightest real constraint. When command triggers already do the heavy lifting, keep the operator-entered copy minimal.

### Kakao BasicCard changes must be checked against schema-required fields
- Mistake: I accepted a frontend/app-side explanation for `!연결` failure without re-checking the chatbot's final Kakao payload shape, and the direct cause was a chatbot `basicCard` missing `thumbnail.imageUrl`.
- Rule: Whenever a Kakao response uses `basicCard`, verify required schema fields in the builder itself and add tests that assert those fields are present so console-only failures do not slip through.
