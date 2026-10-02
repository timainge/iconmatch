#!/usr/bin/env bash
# PreToolUse (Decide): guardrails for the autonomous loop.
#   Write|Edit: protect human-owned files (spec, reviewed eval set, review marker).
#   Bash: block outward-facing/irreversible commands; gate `git commit` on `npm run check`.
# A heuristic guardrail, not a sandbox. Set ICONMATCH_ALLOW_PROTECTED=1 for a human-directed session.
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"deny", permissionDecisionReason:$r}}'
  exit 0
}

protected_reason() { # $1 = repo-relative path or command text
  [ "${ICONMATCH_ALLOW_PROTECTED:-}" = "1" ] && return 1
  case "$1" in
    *docs/plan.md*) echo "docs/plan.md is human-owned. Record the issue in DECISIONS.md under a SPEC-QUESTION heading instead." ;;
    *eval/REVIEWED*) echo "eval/REVIEWED is the human's review signal. Only the human creates it." ;;
    *eval/queries.json*)
      [ -e eval/REVIEWED ] || return 1
      echo "eval/queries.json has been human-reviewed (eval/REVIEWED exists). Put suspected label errors in eval/label-issues.md." ;;
    *eval/v[0-9]*/REVIEWED*) echo "eval/v*/REVIEWED is the human's review signal for that eval revision. Only the human creates it." ;;
    *eval/v[0-9]*/queries.json*)
      rev=$(echo "$1" | grep -oE 'eval/v[0-9]+' | head -1)
      [ -e "$rev/REVIEWED" ] || return 1
      echo "$rev/queries.json has been human-reviewed ($rev/REVIEWED exists). Put suspected label errors in eval/label-issues.md." ;;
    *) return 1 ;;
  esac
}

tool=$(echo "$input" | jq -r '.tool_name // empty')
case "$tool" in
  Write|Edit|MultiEdit|NotebookEdit)
    f=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
    f=${f#"$PWD"/}
    r=$(protected_reason "$f") && deny "$r"
    ;;
  Bash)
    cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
    # Outward-facing or irreversible: human checkpoint.
    # A release the owner has explicitly authorised in the conversation is
    # written as one command prefixed `ICONMATCH_RELEASE=1 `; force pushes never pass.
    echo "$cmd" | grep -qE '\bgit\s+push\b.*(\s--force|\s-f\b|\s\+)' && deny "Force pushes are never allowed."
    release=$(echo "$cmd" | grep -cE '^ICONMATCH_RELEASE=1 (git push|npm publish)( |$)')
    if [ "$release" = "0" ]; then
      echo "$cmd" | grep -qE '\bgit\s+push\b' && deny "Pushing is a human checkpoint. Commit locally and report instead (an owner-authorised push is prefixed ICONMATCH_RELEASE=1)."
      echo "$cmd" | grep -qE '\b(npm|pnpm|yarn)\s+publish\b' && deny "Publishing is a human checkpoint. Use 'npm pack --dry-run' to verify contents (an owner-authorised publish is prefixed ICONMATCH_RELEASE=1)."
    elif echo "$cmd" | grep -qE '[;&|`$()<>]'; then
      deny "A release command must be a single plain command, not chained or substituted."
    fi
    echo "$cmd" | grep -qE '\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+--\s+\.|restore\s+\.|branch\s+-D|rebase)\b' \
      && deny "Destructive git command blocked. Fix forward with a new commit instead."
    echo "$cmd" | grep -qE -- '--no-verify|--amend' && deny "Don't bypass verification or rewrite commits. Make a new commit."
    # Shell writes to protected files (redirect/tee targets, in-place edits, file ops naming them).
    targets=$(echo "$cmd" | grep -oE '(>>?|\btee(\s+-a)?)\s*[^ ;|&]+|\b(sed\s+-i|perl\s+-[a-z]*i|mv|cp|rm|touch|truncate)\b[^;|&]*' )
    if [ -n "$targets" ]; then
      r=$(protected_reason "$targets") && deny "$r"
    fi
    # Commit gate: every commit must be green.
    if echo "$cmd" | grep -qE '\bgit\s+commit\b'; then
      out=$(npm run -s check 2>&1) || deny "npm run check is failing, so commit is blocked. Fix the cause (don't weaken tests or lint):
$(echo "$out" | tail -40)"
    fi
    ;;
esac
exit 0
