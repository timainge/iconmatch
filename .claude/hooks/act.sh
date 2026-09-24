#!/usr/bin/env bash
# PostToolUse Write|Edit (Act): format + lint the edited file; feed remaining lint errors back to Claude.
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -n "$f" ] && [ -f "$f" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
case "$f" in "$PWD"/node_modules/*|"$PWD"/dist/*) exit 0;; "$PWD"/*) ;; *) exit 0;; esac
case "$f" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs)
    out=$(npx --no-install eslint --fix "$f" 2>&1)
    npx --no-install prettier --write --log-level=warn "$f" >/dev/null 2>&1
    if [ -n "$out" ] && echo "$out" | grep -q 'error'; then
      jq -n --arg r "ESLint errors remain in $f:
$out" '{decision:"block", reason:$r}'
    fi
    ;;
  *) npx --no-install prettier --write --ignore-unknown --log-level=warn "$f" >/dev/null 2>&1 ;;
esac
exit 0
