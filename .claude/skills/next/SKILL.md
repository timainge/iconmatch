---
name: next
description: Take the next unfinished item from docs/progress.md and carry it through to done — implement against the spec in docs/plan.md, verify, record, commit. Use when asked to continue, pick up the next task, or run the build loop (e.g. `/loop /next`).
---

Run one iteration of the build loop. If $ARGUMENTS names a specific checklist item, work on that one instead of the next. Follow `CLAUDE.md` (definition of done, anti-gaming rules) throughout.

1. **Pick.** Read `docs/progress.md` and choose the first unchecked item that is available: not `BLOCKED`, and not tagged `WAITS: eval/REVIEWED` unless that file exists.
   - If the previous milestone's items are all ticked (ignoring waiting items) but `docs/audits/M<n>.md` doesn't exist or has open gaps, run `/audit M<n>` first, unless that milestone's audit item is itself waiting. That is this iteration's work.
   - If the item is a **SOFT CHECKPOINT**, write `docs/checkpoints/M<n>.md`. For M3, include provisional dev and test numbers, the threshold sweep, failing groups, the 10–15 eval labels most worth a human look, and how to resume: review, then create `eval/REVIEWED`. Send a push notification if the PushNotification tool is available, tick the item, commit, and **continue** with the next available item on the next iteration.
   - When `eval/REVIEWED` has just appeared, the first `WAITS` item (re-baseline) comes before anything else.
   - If nothing is available, report what's blocked or waiting and why, then end the loop without changes. "End the loop" means: in `/loop` dynamic mode, call ScheduleWakeup with `stop: true`. Otherwise, just finish.
2. **Orient.** Read the spec sections the item cites (and §10, §11.1 and §14), plus `DECISIONS.md`. List the MUSTs this item touches. MUSTs are non-negotiable. For a SHOULD, you may deviate if you record why.
3. **Check the ground truth.** Before relying on a package's layout, metadata or API, inspect it in `node_modules` or its source. Record the finding in `DECISIONS.md`.
4. **Scope.** If the item won't fit one focused commit (a rough guide: under ~400 changed lines excluding fixtures), split it into sub-items in `docs/progress.md` and take the first one.
5. **Build, test-first where practical.** Write the tests that pin each MUST, then implement. Default-tier tests must be offline and fast. Put anything needing the real model or network behind `ICONMATCH_SLOW_TESTS`, and use recorded fixtures for Ollama.
6. **Verify.**
   - `npm run check` must be green. Fix the causes; never weaken tests, lint rules or tsconfig.
   - If embedding code changed, run `npm run test:slow`.
   - If ranking, indexing, embedding text, prompts or confidence changed and the eval exists, run `iconmatch-eval` on `dev` with `--compare baseline`, and handle any regression per spec §9.4.
   - Self-review the diff (`git diff`) against the MUST list from step 2: each MUST needs a test that would fail without it. Remove debug code and stray files.
7. **Record.** Tick the item and add follow-ups to `docs/progress.md`. For a real blocker, mark `BLOCKED: <reason>` (plus dependents), revert or park the partial work so the tree is clean and green, and go back to step 1.
8. **Commit.** Make one focused commit, `M<n>: <item>`, containing the code, tests, progress and decisions. The guard hook runs `npm run check` first. Never push, never amend.
9. **Report.** In one or two lines: what was completed, what's next, and any new blockers.
