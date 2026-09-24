# Progress

Checklist derived from `docs/plan.md` §11. The spec is the source of truth for _what_; this file tracks _where we are_. Split items as needed; mark blocked items `- [ ] BLOCKED: <reason>`. Each milestone ends with an audit (`/audit`, spec §11.1); gaps come back here as `AUDIT:` items. Items tagged `WAITS: eval/REVIEWED` are skipped until the human creates that file (soft checkpoint, spec §14); all other work continues.

## M1: Ingest + keyword search

- [x] Test infrastructure: vitest config, `ICONMATCH_SLOW_TESTS` gating helper, deterministic fake `Embedder`, fixture layout (§10)
- [x] Adapter interface + types (§6.1)
- [x] Tabler adapter: SVGs from `@iconify-json/tabler`, outline only (drop `-filled`), include + flag brands, mark letter/number glyphs, skip deprecated, log counts; locate tag/category source and record in DECISIONS.md
- [x] `ingest` → `build/catalog.json` + `build/svgs.json`
- [ ] `index` → MiniSearch keyword index with field boosts, fuzzy/prefix, stopwords, plural folding
- [ ] Core primitives: `DataSource` (fetch, memory, `iconmatch/node` fs/packaged), per-artifact loaders, subpath exports (§7.0)
- [ ] Runtime: `createIconMatcher(parts)` with capability errors, keyword-only `search()`, `get()`, query normalisation
- [ ] `renderSvg`/`svg()` output per §7.6 + snapshot tests
- [ ] Lettered fallback: `letterFallback()`, verify `square-letter-*`/`square-number-*` ids, exclude glyphs from ranking (§7.4)
- [ ] Browser bundle test: default entry has no Node built-ins or transformers (esbuild)
- [ ] Build CLI (`iconmatch-build`) + `iconmatch.config.ts`
- [ ] 200-icon fixture subset committed for tests (§10)
- [ ] Audit M1 (§11.1)

## M2: Vectors + hybrid

- [ ] Shared query prefix constant; `iconmatch/embedder-transformers` subpath (lazy model load, model location, `localOnly`), optional peer dep
- [ ] `embed` → int8 `vectors.bin` + `vector-ids.json` (float32 flag)
- [ ] Cosine (int8/float32), RRF fuse, confidence, tie-breaks, fallback
- [ ] `searchByEmbedding` with dims validation; embedder/manifest mismatch error
- [ ] `remoteSearch` part: timeout, fallback to local keyword on failure
- [ ] Table-driven test over partial part combinations
- [ ] `examples/server`: `handle(Request)` for search/best/icons, tested in-process (§7.7)
- [ ] `examples/browser-client`: remote search + SVG provider + review/override flow; works with remote down
- [ ] `examples/local-full`: fs source + local model, `localOnly`; slow-tier real-model test
- [ ] Determinism test (ingest + embed twice → identical hashes)
- [ ] Slow-tier reference-vector test for the real model (§11.1)
- [ ] `npm run bench`: warm query + embedding latency vs §7.5 targets
- [ ] Audit M2 (§11.1)

## M3: Eval harness

- [ ] Draft ≥120 eval queries (incl. ≥10 no-match) with stratified dev/test split (§9.1) — flag for human review
- [ ] `iconmatch-eval`: Hit@1/3/5, MRR, fallback P/R, per-group; unknown-id check; `--split`; JSON output + `--compare baseline` (§9.4)
- [ ] Provisional results table for configs 1–3 + `minConfidence` sweep → `eval/results/<date>.md`
- [ ] Audit M3 (§11.1)
- [ ] **SOFT CHECKPOINT:** write `docs/checkpoints/M3.md` (provisional numbers, failing groups, labels to review), notify the human, tick this, and continue
- [ ] Re-baseline on the reviewed eval set; choose default `minConfidence` from the dev sweep — WAITS: eval/REVIEWED

## M4: Enrichment

- [ ] Enrichment provider interface (Ollama + OpenAI-compatible/LM Studio), tested on recorded fixtures (§14)
- [ ] Text enrichment: prompts, zod schema, retries, jsonl cache, `--limit`, concurrency/backoff
- [ ] Local LLM runtime: install/start Ollama (or LM Studio), pull models, record timings in DECISIONS.md
- [ ] Run text enrichment over full catalog
- [ ] Vision enrichment: resvg render, `visionFor: sparse|all`; run over sparse icons
- [ ] Eval configs 4–5 with deltas against baseline — WAITS: eval/REVIEWED
- [ ] Audit M4 (§11.1) — WAITS: eval/REVIEWED

## M5: Package

- [ ] Query expansion hook + README example (no eval)
- [ ] `package` stage: manifest, licenses, size report
- [ ] README with examples + Tabler MIT notice + brand trademark note; publish-ready `package.json` with subpath exports
- [ ] CI: build with `--enrich none` on 200-icon subset (workflow file only; never pushed)
- [ ] `npm pack --dry-run` contents check; per-composition size report
- [ ] Eval configs 6–7 (query expansion, int8 vs float32) and final results on the test split vs the acceptance bar — WAITS: eval/REVIEWED
- [ ] Audit M5 (§11.1) — WAITS: eval/REVIEWED
