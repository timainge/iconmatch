# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

iconmatch: semantic icon matching for user-defined categories. TypeScript, ESM, npm workspaces (`packages/core` = published runtime library, `packages/pipeline` = build CLI, `eval`). Core must run in Node 20+ **and** browsers, so don't use Node-only APIs in `packages/core` outside clearly isolated loaders.

- `npm run check`: typecheck + lint + format check + tests. Must be green before anything counts as done.
- `npm test -- <pattern>`: run a subset of tests.
- Typecheck is a single root `tsconfig.json` across all workspaces; packages extend `tsconfig.base.json`.

## Plan and records

- `docs/plan.md` is the spec and the source of truth. Read the relevant sections before working. **Don't edit it.** Prettier ignores it.
- `docs/progress.md` is the working checklist. Tick items off, split big ones, add discovered tasks, mark blockers.
- `DECISIONS.md`: record every deviation from a SHOULD, and every choice the spec leaves open, with a one-line reason (spec requirement).

## Operating mode: autonomous dark factory

Work runs lights-out, with no human in the loop, driven by `/next` (or `/loop /next`).

- Don't stop to ask for approval or preferences. Make a reasonable choice, record it in `DECISIONS.md`, and keep going.
- Spec §13 open questions: use the stated defaults (no brand icons; neutral fallback glyph; etc.), log them in `DECISIONS.md`, and don't block on them.
- **Human checkpoints override autonomy.** Stop after M3 with the baseline eval numbers, and flag the drafted eval set for human review. Also stop for real blockers: missing secrets, anything that costs money, or irreversible/outward-facing actions (publishing to npm, pushing, deleting data).
- No Ollama in CI or tests. Enrichment tests use recorded fixtures.
- Commit after each completed checklist item: small, focused commits. Never push.

## Hooks (`.claude/hooks/`)

These form an observe, orient/decide, act loop:

- SessionStart shows open checklist items and git state.
- Edits are auto-formatted, and ESLint errors are fed back to you.
- Stop is blocked while typecheck or tests fail (only when code files are uncommitted).

If a hook blocks you, fix the cause. Don't work around the hook.
