# Progress

Checklist derived from `docs/plan.md` §11. The spec is the source of truth for _what_; this file tracks _where we are_. Split items as needed; mark blocked items `- [ ] BLOCKED: <reason>`. Each milestone ends with an audit (`/audit`, spec §11.1); gaps come back here as `AUDIT:` items. Items tagged `WAITS: eval/REVIEWED` are skipped until the human creates that file (soft checkpoint, spec §14); all other work continues.

## M1: Ingest + keyword search

- [x] Test infrastructure: vitest config, `ICONMATCH_SLOW_TESTS` gating helper, deterministic fake `Embedder`, fixture layout (§10)
- [x] Adapter interface + types (§6.1)
- [x] Tabler adapter: SVGs from `@iconify-json/tabler`, outline only (drop `-filled`), include + flag brands, mark letter/number glyphs, skip deprecated, log counts; locate tag/category source and record in DECISIONS.md
- [x] `ingest` → `build/catalog.json` + `build/svgs.json`
- [x] `index` → MiniSearch keyword index with field boosts, fuzzy/prefix, stopwords, plural folding
- [x] Core primitives: `DataSource` (fetch, memory, `iconmatch/node` fs/packaged), per-artifact loaders, subpath exports (§7.0)
- [x] Runtime: `createIconMatcher(parts)` with capability errors, keyword-only `search()`, `get()`, query normalisation
- [x] `renderSvg`/`svg()` output per §7.6 + snapshot tests
- [x] Lettered fallback: `letterFallback()`, verify `square-letter-*`/`square-number-*` ids, exclude glyphs from ranking (§7.4); add the lettered-glyph `svg()` snapshot (§10) to `svg.test.ts`
- [x] Browser bundle test: default entry has no Node built-ins or transformers (esbuild)
- [x] Build CLI (`iconmatch-build`) + `iconmatch.config.ts`
- [x] 200-icon fixture subset committed for tests (§10)
- [x] Audit M1 (§11.1): see `docs/audits/M1.md`
- [x] AUDIT: test that wire types (`IconMatch` incl. fallbacks, `CatalogEntry`, `SvgBody`) survive a JSON round-trip and `renderSvg` output is unchanged (§7.0 rule 4)

## M2: Vectors + hybrid

- [x] Shared query prefix constant; `iconmatch/embedder-transformers` subpath (lazy model load, model location, `localOnly`), optional peer dep
- [x] `embed` → int8 `vectors.bin` + `vector-ids.json` (float32 flag); the embed stage must use `embeddingInput`/the shared embedder, and extend `query-prefix.test.ts` to assert the build imports the shared module (§11.1 M2); add the `loadVectors` loader for this format (deferred from the M1 core-primitives item)
- [x] Cosine (int8/float32), RRF fuse, confidence, tie-breaks, fallback
- [x] `searchByEmbedding` with dims validation; embedder/manifest mismatch error
- [x] `remoteSearch` part: timeout, fallback to local keyword on failure
- [x] Table-driven test over partial part combinations
- [x] `examples/server`: `handle(Request)` for search/best/icons, tested in-process (§7.7)
- [x] `examples/browser-client`: remote search + SVG provider + review/override flow; works with remote down
- [x] `examples/local-full`: fs source + local model, `localOnly`; slow-tier real-model test
- [x] Determinism test (ingest + embed twice → identical hashes)
- [x] Slow-tier reference-vector test for the real model (§11.1)
- [x] `npm run bench`: warm query + embedding latency vs §7.5 targets
- [x] Audit M2 (§11.1): see `docs/audits/M2.md`
- [x] AUDIT: test that keyword and vector rankings each contribute at most 50 ids to fusion (§7.2 steps 2–3)
- [ ] AUDIT: BLOCKED: needs packaged data from the M5 `package` stage. Test `examples/server` `createServer()` with defaults (packagedSource + transformers embedder, unloaded until first search) (§7.7)

## M3: Eval harness

- [x] Draft ≥120 eval queries (incl. ≥10 no-match) with stratified dev/test split (§9.1) — flag for human review
- [x] `iconmatch-eval`: Hit@1/3/5, MRR, fallback P/R, per-group; unknown-id check; `--split`; JSON output + `--compare baseline` (§9.4)
- [x] Provisional results table for configs 1–3 + `minConfidence` sweep → `eval/results/<date>.md`
- [x] Audit M3 (§11.1): see `docs/audits/M3.md`
- [x] AUDIT: test that the eval's inferred fallback equals `matcher.best().isFallback` for every query (fixture, several thresholds)
- [x] **SOFT CHECKPOINT:** write `docs/checkpoints/M3.md` (provisional numbers, failing groups, labels to review), notify the human, tick this, and continue
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
- [ ] `package` stage (unblocks the M2 AUDIT server-defaults test): manifest (from `build/embed-meta.json`), licenses, size report; data excluding SVGs is ~4.55 MB vs the 4 MB §6.6 target: reduce (e.g. drop glyph vectors, trim index) or record the overage
- [ ] README with examples + Tabler MIT notice + brand trademark note (§6.1.3) + note that keyword-only quality is lower (§7.2.7); publish-ready `package.json` with subpath exports
- [ ] CI: build with `--enrich none` on 200-icon subset (workflow file only; never pushed)
- [ ] `npm pack --dry-run` contents check; per-composition size report
- [ ] Eval configs 6–7 (query expansion, int8 vs float32) and final results on the test split vs the acceptance bar — WAITS: eval/REVIEWED
- [ ] Audit M5 (§11.1) — WAITS: eval/REVIEWED
