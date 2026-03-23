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
