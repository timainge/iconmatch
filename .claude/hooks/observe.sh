#!/usr/bin/env bash
# SessionStart (Observe): surface current plan, blockers, checkpoints and repo state as context.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
echo "## Open plan items (docs/progress.md)"
if [ -s docs/progress.md ]; then
  grep -nE '^\s*[-*] \[ \]' docs/progress.md | grep -v 'BLOCKED' | grep -v 'WAITS:' | head -12 || true
  grep -qE '^\s*[-*] \[ \]' docs/progress.md || echo "(no unchecked items)"
  blocked=$(grep -nE '^\s*[-*] \[ \].*BLOCKED' docs/progress.md)
  [ -n "$blocked" ] && printf '\n## Blocked\n%s\n' "$blocked"
  waiting=$(grep -nE '^\s*[-*] \[ \].*WAITS:' docs/progress.md)
  if [ -n "$waiting" ]; then
    if [ -e eval/REVIEWED ]; then printf '\n## Waiting items now available (eval/REVIEWED exists)\n%s\n' "$waiting"
    else printf '\n## Waiting on eval/REVIEWED (skip these)\n%s\n' "$waiting"; fi
  fi
else
  echo "(docs/progress.md missing or empty)"
fi
echo
echo "## Checkpoints"
ls docs/checkpoints/*.md 2>/dev/null || echo "(none written)"
[ -e eval/REVIEWED ] && echo "eval/REVIEWED present: eval set is human-reviewed and frozen"
grep -c 'SPEC-QUESTION' DECISIONS.md 2>/dev/null | sed 's/^/Open SPEC-QUESTION entries in DECISIONS.md: /'
echo
echo "## Git state"
git status --short --branch 2>/dev/null | head -20
git log --oneline -5 2>/dev/null
