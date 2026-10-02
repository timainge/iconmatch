# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

iconmatch: semantic icon matching for user-defined categories. TypeScript, ESM, npm workspaces (`packages/core` = published runtime library, `packages/pipeline` = build CLI, `eval`). Core must run in Node 20+ **and** browsers. Node-only code in `packages/core/src` goes only in `*.node.ts` loaders, and `@huggingface/transformers` only in `src/embedders/`. ESLint enforces both.

Core is **composable primitives**, not one monolith (spec §7.0): data sources, per-artifact loaders, keyword/vector searchers, fusion, embedders, SVG providers, rendering and the lettered fallback. Each takes its dependencies as arguments and never fetches, reads files or loads a model on its own. Deployments (server, browser client, Tauri-style local-full) are thin compositions in `examples/`. v1 is Tabler, outline only, with brand icons included.

- `npm run check`: typecheck + lint + format check + default-tier tests. Must be green before any commit.
- `npm test -- <pattern>`: run a subset of tests.
- `npm run test:slow`: slow tier (real embedding model, full pipeline). Gated by `ICONMATCH_SLOW_TESTS=1`. Run it at milestone audits and after embedding changes.
- Typecheck is a single root `tsconfig.json` across all workspaces; packages extend `tsconfig.base.json`.

## Records

| File                       | Owner | Purpose                                                                                                                |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/plan.md`             | human | Spec and source of truth. **Never edit.** Spec problems go in `DECISIONS.md` as `SPEC-QUESTION` entries.               |
| `docs/progress.md`         | agent | Working checklist. Tick items, split big ones, add discovered tasks, mark `BLOCKED: <reason>`.                         |
| `DECISIONS.md`             | agent | Every SHOULD deviation, open choice and verified external fact, with a one-line reason. Newest last.                   |
| `docs/audits/M<n>.md`      | agent | Milestone evidence against spec §11.1.                                                                                 |
| `docs/checkpoints/M<n>.md` | agent | Handoff reports for a human checkpoint (soft or hard).                                                                 |
| `eval/queries.json`        | both  | Agent drafts it. Frozen once the human creates `eval/REVIEWED`. After that, label doubts go in `eval/label-issues.md`. |

## Operating mode: autonomous dark factory

Work runs lights-out, with no human in the loop, driven by `/loop /next`. Each `/next` takes one checklist item from pick to commit. When a milestone's last item is ticked, `/next` runs `/audit` before starting the next milestone.

- **Don't ask; decide.** Make the conservative, reversible choice, record it in `DECISIONS.md`, and keep going. For spec §13 questions, use the defaults stated there.
- **Verify facts, don't assume them.** Inspect installed packages (`node_modules/...`) or source before relying on file layouts, metadata fields or model ids. Record what you found and where in `DECISIONS.md`.
- **Blockers don't stop the loop.** Mark the item `BLOCKED: <reason>`, also block anything that truly depends on it, and take the next available item. Stop the loop only when every remaining item is done, `BLOCKED` or waiting.
- **Local tooling is allowed.** You may install npm packages, download Hugging Face models, and install and run a local LLM runtime for M4 (`brew install ollama`, `ollama serve`, `ollama pull`, or LM Studio). See spec §14.
- **Soft checkpoint after M3** (eval review). Write `docs/checkpoints/M3.md` and send a push notification if the tool is available, then **keep going**. Items tagged `WAITS: eval/REVIEWED` are skipped until the human creates that file. Until then, all eval numbers are provisional: never cite them in the README or treat them as meeting the acceptance bar.
- **Hard checkpoints** (stop and report): anything that costs money, needs secrets, or is outward-facing or irreversible (push, publish, deleting data outside `build/` and `cache/`).
- **No Ollama in CI or default-tier tests.** Enrichment tests use recorded fixtures. The default tier never touches the network.

## Definition of done (per checklist item)

1. Every MUST in the cited spec sections is implemented, and each has a test that would fail without it.
2. `npm run check` is green. Tests, lint rules and tsconfig strictness are never weakened to get there; skipped or `.only` tests don't count.
3. If ranking, indexing, embedding text, prompts or confidence changed (once the eval exists), you ran `iconmatch-eval` on `dev` and handled any regression per spec §9.4.
4. `docs/progress.md` and `DECISIONS.md` are updated, and the work is in one focused commit (`M<n>: <item>`) with no unrelated changes. Never push. Never amend or rewrite history.

## Anti-gaming rules

- Tune only on the eval `dev` split. Report on `test`. Never change eval labels to improve scores.
- Don't special-case eval queries in code (no hard-coded query→icon maps outside documented, general synonym lists).
- Snapshot updates (`-u`) need a stated reason in the commit message.

## Hooks (`.claude/hooks/`)

These form an observe, orient/decide, act loop:

- **SessionStart** (`observe.sh`): shows open, blocked and waiting checklist items, checkpoints, the eval review state, and git state.
- **PreToolUse** (`guard.sh`): blocks edits to human-owned files, `git push`, `npm publish`, destructive git, `--no-verify` and `--amend`. It runs `npm run check` before every `git commit` and denies the commit if it fails. A human-directed session can set `ICONMATCH_ALLOW_PROTECTED=1` to edit protected files. A push or publish the owner has explicitly authorised in the conversation runs as a single command prefixed `ICONMATCH_RELEASE=1` (force pushes are always denied); the autonomous loop never uses it. Likewise, a spec addition the owner has asked for is appended as `ICONMATCH_OWNER_EDIT=1 cat <file> >> docs/plan.md`; existing spec text is never rewritten.
- **PostToolUse** (`act.sh`): auto-formats edits and feeds ESLint errors back to you.
- **Stop** (`verify.sh`): blocks stopping while `npm run check` fails (only when code files are uncommitted).

If a hook blocks you, fix the cause. Don't work around the hook.

## Running unsupervised

- **Headless (preferred for long runs):** `caffeinate -i scripts/factory.sh 30` runs one fresh `claude -p "/next"` per item, logs to `.factory/logs/`, and stops when nothing is available (all done, blocked or waiting), on a dirty tree, or after two iterations without a commit.
- **Interactive:** `claude --permission-mode bypassPermissions`, then `/loop /next`. `/next` ends the loop itself when nothing is available.

## Skills

- `/next [item]`: one loop iteration, from pick to commit.
- `/audit [M<n>]`: milestone verification against spec §11.1. Writes `docs/audits/M<n>.md` and adds any gaps to the checklist.
