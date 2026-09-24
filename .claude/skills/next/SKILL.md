---
name: next
description: Take the next unfinished item from docs/progress.md and carry it through to done — implement against the spec in docs/plan.md, verify, record, commit. Use when asked to continue, pick up the next task, or run the build loop (e.g. `/loop /next`).
---

Run one iteration of the build loop. If $ARGUMENTS names a specific checklist item, work on that one instead of the next.

1. **Pick.** Read `docs/progress.md` and choose the first unchecked item that isn't blocked.
   - If it's a **HUMAN CHECKPOINT**, stop. Write the report it asks for (for M3, the baseline eval numbers from `eval/results/`) and end the loop. Don't start later milestones.
   - If every item is done or blocked, report that and stop without making changes.
2. **Orient.** Read the sections of `docs/plan.md` that the item cites, and check `DECISIONS.md` for earlier choices. MUST requirements are non-negotiable. For a SHOULD, you may deviate if you record why.
3. **Scope.** If the item is too big for one focused commit, split it into sub-items in `docs/progress.md` and take the first one.
4. **Build.** Implement it with tests (see spec §10 for what each area needs). Make judgement calls yourself and record them in `DECISIONS.md`.
5. **Verify.** Run `npm run check` and fix everything until it's green. Never weaken a test or lint rule just to get it passing.
6. **Record.** Tick the item in `docs/progress.md` and add any follow-up tasks. For a real blocker (secrets, cost, irreversible or outward-facing action), mark it `BLOCKED: <reason>` and go back to step 1.
7. **Commit.** Make one focused commit with the code, progress and decisions. Never push.
8. **Report.** In one or two lines: what was completed, what's next.
