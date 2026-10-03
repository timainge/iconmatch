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
- [x] AUDIT: (unblocked by the `package` stage; slow tier: build + package the real data first) Test `examples/server` `createServer()` with defaults (packagedSource + transformers embedder, unloaded until first search) (§7.7)

## M3: Eval harness

- [x] Draft ≥120 eval queries (incl. ≥10 no-match) with stratified dev/test split (§9.1) — flag for human review
- [x] `iconmatch-eval`: Hit@1/3/5, MRR, fallback P/R, per-group; unknown-id check; `--split`; JSON output + `--compare baseline` (§9.4)
- [x] Provisional results table for configs 1–3 + `minConfidence` sweep → `eval/results/<date>.md`
- [x] Audit M3 (§11.1): see `docs/audits/M3.md`
- [x] AUDIT: test that the eval's inferred fallback equals `matcher.best().isFallback` for every query (fixture, several thresholds)
- [x] **SOFT CHECKPOINT:** write `docs/checkpoints/M3.md` (provisional numbers, failing groups, labels to review), notify the human, tick this, and continue
- [x] Re-baseline on the reviewed eval set; choose default `minConfidence` from the dev sweep — WAITS: eval/REVIEWED

## M4: Enrichment

- [x] Enrichment provider interface (Ollama + OpenAI-compatible/LM Studio), tested on recorded fixtures (§14)
- [x] Text enrichment (a): versioned prompts + few-shots, zod schema + JSON schema, `inputHash`, single-icon enrichment with validation and up to 2 retries (§6.3)
- [x] Text enrichment (b): `pipeline/cache/enrichment.jsonl` cache by `inputHash`, runner with `--limit`, concurrency (default 2), exponential backoff on provider errors, `enrich` CLI stage feeding index + embed (§6.3)
- [x] Local LLM runtime: install/start Ollama (or LM Studio), pull models, record timings in DECISIONS.md; replace the synthetic `fixtures/ollama/*.json` with real recordings
- [x] Run text enrichment over full catalog
- [x] Vision enrichment (a): resvg 256×256 render, `sparse` rule (readability + < 3 tags), vision prompt + `enrichVision` (§6.3)
- [x] Vision enrichment (b): `--mode vision` in runner/stage (`visionFor: sparse|all`, vision model for selected icons, text for the rest)
- [x] Vision enrichment (c): after the text run finishes, time `qwen2.5vl:7b`, record a real vision fixture, and run `enrich --mode vision` over the 655 sparse icons
- [x] Eval configs 4–5 with deltas against baseline — WAITS: eval/REVIEWED (result: enrichment regresses; not adopted)
- [x] Enrichment v2 (discovered): make enrichment beat baseline on dev or keep it off. Candidates: `text-v2` prompt (specific everyday concepts, fewer generic domains, no colours), lower `concepts` boost / drop `domains` from document text; tune on dev only, compare with `--compare baseline` (entries `text`, `vision`), report test once (result: text-v2 +0.055 dev MRR but test Hit@3 0.758 → 0.606; not adopted, packaged defaults stay unenriched)
- [x] Audit M4 (§11.1) — WAITS: eval/REVIEWED (17/17 met; 1 gap in M2 code)
- [x] AUDIT: `local-full` isn't hermetic: with `localOnly` + local `modelLocation`, transformers.js still reads its default fs cache, so an empty `modelDir` doesn't fail (slow test "refuses to download…" fails); disable the fs/browser caches in that mode + default-tier test (see `docs/audits/M4.md` G1)

## M5: Package

- [x] Query expansion hook + README example (no eval): hook in core, example in `examples/query-expansion/` (README item must include it)
- [x] `package` stage: manifest (from `build/embed-meta.json`), licenses, size report; excluding-SVGs overage (4.55 MB vs 4 MB) recorded in DECISIONS.md
- [x] Publish-ready `packages/core/package.json`: subpath exports (`source` → src for dev, `types`/`default` → dist), `files`, `sideEffects`, engines, `build`/`prepack`
- [x] README with type-checked examples (incl. the query-expansion example from `examples/query-expansion/`) + Tabler MIT notice (§8) + brand trademark note (§6.1.3) + keyword-only quality note (§7.2.7)
- [x] `matcher.attributions()` + `attributionRequired` per set in the manifest (§8 MUST; found while writing the README)
- [x] CI: build with `--enrich none` on 200-icon subset (workflow file only; never pushed)
- [x] `npm pack --dry-run` contents check; per-composition size report
- [x] Eval config 7: int8 vs float32 on the baseline — WAITS: eval/REVIEWED (equivalent; int8 kept)
- [x] Eval config 6 (query expansion via the Ollama example) and final results table on the test split vs the acceptance bar, after the Enrichment v2 decision — WAITS: eval/REVIEWED (expansion not adopted; baseline test Hit@3 0.758 meets the bar, fallback R 0.20 does not)
- [x] Confidence calibration (discovered, dev-only tuning): test fallback recall 0.20 < 0.60 bar. Try no +0.1 bump for partial-word keyword matches and/or a margin/percentile confidence; re-sweep `minConfidence` on dev, report test once (result: no change; current formula dev AUC 0.989, no variant separates better; test gap is dev/test difference on 5 queries)
- [x] Expansion confidence (discovered): score confidence on the original query only (expansions still add candidates); re-run configs 6/baseline-expansion on dev (result: original-only scores worse, dev F1 0.667 vs 0.80; max kept, doc says use minConfidence ≈ 0.65 with expansion)
- [x] README: now that the eval is reviewed, replace the "provisional `minConfidence`" wording and state the final test numbers and acceptance verdict (after the calibration item)
- [x] Audit M5 (§11.1) — WAITS: eval/REVIEWED (14/14 met; acceptance bar: Hit@3 met, fallback recall not met, reported)

## Post-v1: fallback recall (owner-directed, 2026-10-02)

The owner asked to try, in order: more no-match queries in a new eval revision, a stronger embedding model, then accept the result.

- [x] Eval v2 draft: `eval/v2/queries.json` = v1 + 30 no-match queries (objective catalog filter, hashed splits), provisional results in `eval/v2/results/`
- [x] Re-baseline on v2 and re-choose `minConfidence` on v2 dev (v2 dev sweep suggests 0.65), report test — WAITS: eval/v2/REVIEWED (done: 0.65, dev F1 0.903; keyword stays 0.50)
- [x] Stronger embedding model: compare transformers.js-compatible candidates (e.g. bge-base-en-v1.5) against bge-small on v1 (reviewed) and v2 (provisional) dev; sizes and latency; adopt only on dev evidence, report test after review (result: bge-base/large not better on dev; bge-small kept. bge-small at 0.65 meets both bars on v2 test, provisional)
- [x] Verdict: final acceptance-bar result on v2 test with the chosen model and threshold; accept or record what's still failing — WAITS: eval/v2/REVIEWED (done: hybrid test Hit@3 0.758, fallback R 0.71 at 0.65; bar met)

## P1: README (spec §15.1)

- [x] Root README as the GitHub landing page (all §15.1 points), numbers test-guarded, code type-checked
- [x] Package README pass: relative links valid on npm, link back to repo/eval; release notes/CHANGELOG started
- [x] Audit P1

## P2: Second icon set — Lucide (spec §15.2)

- [x] Verify Lucide sources (`@iconify-json/lucide`, `lucide-static` tags, categories source, aliases/deprecated, licence) and record in DECISIONS.md
- [x] Lucide adapter + adapter tests (fixture subset moved to the data-package item)
- [x] Lucide lettered fallback (frame + stroke letters) with tests for a–z/0–9
- [x] Set selection in the pipeline config and `@iconmatch/lucide` data package (manifest, packagedSource, pack check, sizes); Lucide CI subset build
- [x] Lucide eval set draft (`eval/lucide/queries.json`, labels by catalog browsing) + provisional results; flag for owner review (checkpoint: docs/checkpoints/P2-lucide-eval.md)
- [x] Lucide threshold + acceptance bar on Lucide test — WAITS: eval/lucide/REVIEWED (0.65; test Hit@3 0.788, fallback R 0.64: met)
- [x] Audit P2

## P3: Alternative embedding model families (spec §15.3)

- [x] Model profile registry (prefix/pooling per model) used by build and runtime; manifest fields; bge-small reference unchanged
- [x] Verify candidates on the Hub; build + eval each on v2 dev (ranking, fallback AUC/F1, size, latency); test once for the chosen one
- [x] Decision: adopt or keep bge-small
- [x] Audit P3

## P4: Choice learning (spec §15.4)

- [x] `ChoiceProvider` + `createChoiceMemory` + matcher `choices` part (exact + embedding-neighbour match, extra RRF ranking, confidence floor)
- [x] browser-client example persists and reuses choices; README section
- [x] Choice eval: exact repeats, no-regression with populated memory; paraphrase set draft for generalisation (provisional) (choiceSimilarity 0.70 chosen on dev; checkpoint docs/checkpoints/P4-paraphrases.md)
- [x] Paraphrase generalisation numbers — WAITS: eval/choices/REVIEWED (held-out MRR 0.567 → 0.912)
- [x] Audit P4

## P5: Metadata enrichment v3 (spec §15.5)

- [x] Variant 1 (keyword-side only) and 2 (tie-break only) implemented behind config; eval on v2 dev with deltas (variant 1 = `enrich.applyTo`, mixed on dev; variant 2 lost offline, not implemented)
- [x] Variant 3 (learned concepts from choice exports) implemented on fixtures (`enrich.learnedFrom`)
- [ ] Variant 3 real-data run — WAITS: real choice data
- [x] Decision recorded; test reported once for any adopted variant (none adopted)
- [x] Audit P5

## P6: Vision model review (spec §15.6)

- [x] Judge module (prompt, zod schema, cache, recorded fixtures)
- [x] Agreement run on v2 top-5 candidates vs human labels (accuracy, κ, P/R); label-issue suggestions appended
- [x] Audit P6

## P7: Icon generation, experimental (spec §15.7)

- [x] SVG validator + style lint (unit tests)
- [x] Generator (few-shot local LLM) + `generate` CLI + HTML gallery; fixture-tested
- [x] Run over v2 no-match concepts; judge + acceptance rates reported (141/168 valid; judge 3/141 fits; agent 0/141; nothing approved)
- [x] `generated` set packaging from an approval file (fixture-tested)
- [x] Audit P7
