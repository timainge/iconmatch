---
name: audit
description: Verify a completed milestone against the spec's acceptance criteria (docs/plan.md §11.1) and every MUST in the sections it covers, writing evidence to docs/audits/M<n>.md and turning gaps into checklist items. Use when a milestone's checklist is fully ticked, before starting the next milestone, or when asked to audit/verify progress.
---

Audit milestone $ARGUMENTS (e.g. `M1`). If no milestone is given, audit the latest milestone whose checklist items are all ticked.

Be adversarial. The goal is to find what's missing, not to confirm success.

1. **Collect criteria.** From `docs/plan.md`, take the milestone's §11.1 acceptance bullets and every MUST in the spec sections its checklist items cite. Number them.
2. **Run everything fresh.**
   - `npm run check`.
   - `npm run test:slow` (from M2 onward).
   - For M1 and later, the pipeline commands the milestone introduced, from a clean `build/` (`rm -rf build` is allowed).
   - From M3 onward, the eval.
   - Capture the key output.
3. **Evidence per criterion.** For each one, record: status (`met` / `partial` / `missing`), evidence (test file and test name, command output, or numbers), and for anything not met, what's missing. A criterion is only `met` if a test or command demonstrates it. "The code looks right" doesn't count.
4. **Probe for weak tests.** For 2–3 of the most important MUSTs, temporarily break the implementation (e.g. skip `-filled` folding, drop the dims check) and confirm a test fails. Restore it afterwards and confirm `git status` is clean for source files. Record the results.
5. **Write** `docs/audits/M<n>.md`: a table of criteria, then commands run with summarised output, then mutation probe results, then gaps.
6. **Close the loop.** Add each gap as an unchecked item under the milestone in `docs/progress.md`, prefixed `AUDIT:`. If there are no gaps, write "Audit passed" at the top of the audit file.
7. **Commit** as `M<n>: audit`. Report the pass/fail count and any gaps in one or two lines.
