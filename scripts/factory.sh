#!/usr/bin/env bash
# Unsupervised build loop: one fresh headless Claude session per /next iteration.
# Fresh context per item keeps long runs sharp; hooks (guard, format, verify) still apply.
#
# Usage: scripts/factory.sh [max-iterations]      (default 30)
#   FACTORY_PERMISSION_MODE  default bypassPermissions (guard.sh is the safety net)
#
# Stops when: a human checkpoint report exists, no unblocked items remain,
# an iteration leaves the tree dirty, or two iterations in a row make no commit.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

max=${1:-30}
mode=${FACTORY_PERMISSION_MODE:-bypassPermissions}
logdir=.factory/logs
mkdir -p "$logdir"

notify() {
  echo "factory: $1"
  command -v osascript >/dev/null && osascript -e "display notification \"$1\" with title \"iconmatch factory\"" 2>/dev/null
}

next_item() { grep -E '^\s*[-*] \[ \]' docs/progress.md | grep -v 'BLOCKED' | head -1; }

stalls=0
for i in $(seq 1 "$max"); do
  item=$(next_item)
  if [ -z "$item" ]; then notify "No unblocked items left. See docs/progress.md."; exit 0; fi
  if echo "$item" | grep -q 'HUMAN CHECKPOINT'; then
    report=$(echo "$item" | grep -oE 'docs/checkpoints/[^` ]+\.md' | head -1)
    if [ -n "$report" ] && [ -e "$report" ]; then notify "Human checkpoint reached: $report"; exit 0; fi
  fi

  before=$(git rev-parse HEAD)
  log="$logdir/$(date +%Y%m%d-%H%M%S)-$i.log"
  echo "factory: iteration $i/$max: ${item#*] }"
  claude -p "/next" --permission-mode "$mode" >"$log" 2>&1
  status=$?
  tail -3 "$log"

  if [ -n "$(git status --porcelain)" ]; then
    notify "Iteration $i left uncommitted changes (exit $status). Stopping; see $log"; exit 1
  fi
  if [ "$(git rev-parse HEAD)" = "$before" ]; then
    stalls=$((stalls + 1))
    [ "$stalls" -ge 2 ] && { notify "Two iterations without a commit. Stopping; see $log"; exit 1; }
  else
    stalls=0
  fi
done
notify "Reached max iterations ($max)."
