#!/usr/bin/env bash
# SessionStart (Observe): surface current plan + repo state as context.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
echo "## Open plan items (docs/progress.md)"
if [ -s docs/progress.md ]; then
  grep -nE '^\s*[-*] \[ \]' docs/progress.md | head -20 || true
  grep -qE '^\s*[-*] \[ \]' docs/progress.md || echo "(no unchecked items)"
else
  echo "(docs/progress.md missing or empty)"
fi
echo
echo "## Git state"
git status --short --branch 2>/dev/null | head -20
git log --oneline -5 2>/dev/null
