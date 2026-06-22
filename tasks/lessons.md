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

### School-role products need explicit role-safe honorific rules
- Mistake: I let the AI prompt say users may call the assistant `코치님` without also forbidding the reverse, and the model started calling students `OOO 코치님`.
- Rule: In products with named roles like school/coach/classroom, explicitly pin both sides of the relationship. State who the assistant is, who the user is, and which honorifics are forbidden so the model never mirrors the assistant's title back onto the user.

### First-time onboarding help should prefer ordered steps over compressed summaries
- Mistake: I optimized `!도움말` for brevity, but new users could not easily tell how to join and start participating.
- Rule: When a help command is meant to start product participation, lead with a numbered click-by-click flow such as entry link -> login -> install -> first record. Keep shortcut summaries for secondary commands like `!앱`, not the main onboarding help.

### Social share flows need direct image delivery and bundled typography
- Mistake: I treated `!공유` like a thumbnail link card and relied on runtime font availability, which led to weak Kakao delivery and broken Korean text on the generated image.
- Rule: For chat share features, send the image itself first when the platform supports it, then follow with the invite CTA/link. For generated Korean visuals, bundle a known font in the repo and render text from that asset instead of assuming the server OS font stack will work.

### Square source thumbnails should stay square in social share cards
- Mistake: I redesigned the `!공유` card around wide media slots even though the underlying habit thumbnails are produced as 1:1 assets, which made the card feel cropped and less intentional.
- Rule: When a source media pipeline already emits square thumbnails, default the share layout to square frames too. Remove redundant explanatory header copy before sacrificing the native aspect ratio of the actual content.

### Revised preview images should use a fresh filename when the client may cache local media
- Mistake: I reused `share-card-preview.png` after changing the renderer, which made it easy for the chat client to keep showing an older cached preview and created confusion about whether the design actually changed.
- Rule: When showing before/after image revisions in the desktop app, write the new render to a uniquely named file and share that exact path so the visible preview cannot be a stale cache hit.

### Share images and share CTAs should not compete in the same first Kakao bubble
- Mistake: I initially bundled the `!공유` image and invite copy into one Kakao response, which made the first impression feel busy even after the image design itself improved.
- Rule: For Kakao share flows, let the first bot response be media-only when the goal is visual sharing. Send referral or app CTA text as a separate follow-up callback message so the shared image lands cleanly first.

### MessengerBot open-chat delivery has different constraints from Kakao skill delivery
- Mistake: I fixed the Kakao skill path for `!공유` first, but I did not re-check that the live open-chat room was actually using the MessengerBot webhook path, which still serialized everything into one text bubble.
- Rule: When a bot behavior is reported from the actual Kakao room, verify the transport first. If the room is powered by MessengerBot, shape the server response for MessengerBot's text-only relay constraints and update the local phone script when multi-message behavior is needed.

### Scheduled OpenChatBot commands must tolerate operator copy
- Mistake: I implemented weekly/monthly best commands assuming the scheduled message would be exactly the command, but real OpenChatBot reservations may use the first line as a trigger and include explanatory copy below it.
- Rule: For scheduled OpenChatBot posts, parse and test the first line/first token as the command and ignore follow-up copy. Add regression cases for both the current phone script's canonical forwarding and older scripts that forward the whole reservation body.

### Public share links should look like short links, not exposed auth tokens
- Mistake: I first exposed the Haebit public gallery as `/h/:token`, which made the link look like a bearer token and feel longer/less trustworthy even though the page was intentionally public.
- Rule: For no-login share pages, use a short, non-sequential public code in the shortest safe route, keep it distinct from auth/link tokens, and add rate limiting or equivalent brute-force friction on public code lookup routes.

### Long media generation needs an immediate progress surface
- Mistake: I linked directly to a dynamically rendered MP4, so the browser showed a blank white page while FFmpeg worked and users had no idea whether anything was happening.
- Rule: Any generation task that can take more than a few seconds must return an immediate HTML/status surface, start work asynchronously, expose meaningful stage-based progress, and only attach the final media after the job is ready. Chat copy must set a realistic wait-time expectation before the user opens the link.

### Montage media should be framed as product content, not raw letterboxed input
- Mistake: I padded photos and videos against black, which made mixed aspect ratios look like unfinished source footage instead of a designed Habits School story.
- Rule: For generated social video, place mixed-aspect media inside a branded scene with date/category context and intentional neutral framing. Treat letterbox space as layout, not empty black pixels.
