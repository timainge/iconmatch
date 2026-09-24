#!/usr/bin/env bash
# Stop (Orient/Decide): if code changed, run the full check; block stopping until green.
input=$(cat)
[ "$(echo "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# Skip read-only turns: only verify when code or config files have uncommitted changes.
git status --porcelain -uall 2>/dev/null | grep -qE '\.(ts|tsx|js|mjs|cjs|json)$' || exit 0
out=$(npm run -s check 2>&1)
if [ $? -ne 0 ]; then
  jq -n --arg r "Verification failed (npm run check). Fix before finishing:
$(echo "$out" | tail -40)" '{decision:"block", reason:$r}'
fi
exit 0
