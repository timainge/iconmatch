# Progress

Checklist derived from `docs/plan.md` §11. The spec is the source of truth for _what_; this file tracks _where we are_. Split items as needed; mark blocked items `- [ ] BLOCKED: <reason>`. Each milestone ends with an audit (`/audit`, spec §11.1); gaps come back here as `AUDIT:` items.

## M1: Ingest + keyword search

- [ ] Test infrastructure: vitest config, `ICONMATCH_SLOW_TESTS` gating helper, deterministic fake `Embedder`, fixture layout (§10)
- [ ] Adapter interface + types (§6.1)
- [ ] Tabler adapter: SVGs from `@iconify-json/tabler`, fold `-filled`, skip brand/deprecated, log counts; locate tag/category source and record in DECISIONS.md
- [ ] `ingest` → `build/catalog.json` + `build/svgs.json`
- [ ] `index` → MiniSearch keyword index with field boosts, fuzzy/prefix, stopwords, plural folding
- [ ] Runtime: `createIconMatcher`, keyword-only `search()`, `get()`, query normalisation
- [ ] `svg()` output per §7.6 + snapshot tests
- [ ] Build CLI (`iconmatch-build`) + `iconmatch.config.ts`
- [ ] 200-icon fixture subset committed for tests (§10)
- [ ] Audit M1 (§11.1)

## M2: Vectors + hybrid

- [ ] Shared query prefix constant; embedder wrapper (lazy-loaded)
- [ ] `embed` → int8 `vectors.bin` + `vector-ids.json` (float32 flag)
- [ ] Cosine (int8/float32), RRF fuse, confidence, tie-breaks, fallback
- [ ] `searchByEmbedding` with dims validation; embedder/manifest mismatch error
- [ ] Determinism test (ingest + embed twice → identical hashes)
- [ ] Slow-tier reference-vector test for the real model (§11.1)
- [ ] `npm run bench`: warm query + embedding latency vs §7.5 targets
- [ ] Audit M2 (§11.1)

## M3: Eval harness

- [ ] Draft ≥120 eval queries (incl. ≥10 no-match) with stratified dev/test split (§9.1) — flag for human review
- [ ] `iconmatch-eval`: Hit@1/3/5, MRR, fallback P/R, per-group; unknown-id check; `--split`; JSON output + `--compare baseline` (§9.4)
- [ ] Results table for configs 1–3 + `minConfidence` sweep → `eval/results/<date>.md`
- [ ] Audit M3 (§11.1)
- [ ] **HUMAN CHECKPOINT: write `docs/checkpoints/M3.md`, stop and report baseline numbers before M4** (resume: human ticks this and creates `eval/REVIEWED`)

## M4: Enrichment

- [ ] Enrichment provider interface (Ollama + OpenAI-compatible/LM Studio), tested on recorded fixtures (§14)
- [ ] Text enrichment: prompts, zod schema, retries, jsonl cache, `--limit`, concurrency/backoff
- [ ] Local LLM runtime: install/start Ollama (or LM Studio), pull models, record timings in DECISIONS.md
- [ ] Run text enrichment over full catalog
- [ ] Vision enrichment: resvg render, `visionFor: sparse|all`
- [ ] Eval configs 4–5
- [ ] Audit M4 (§11.1)

## M5: Package

- [ ] Query expansion hook + eval config 6/7
- [ ] `package` stage: manifest, licenses, size report
- [ ] README with examples + Tabler MIT notice; publish-ready `package.json`
- [ ] CI: build with `--enrich none` on 200-icon subset (workflow file only; never pushed)
- [ ] Browser bundle smoke test (esbuild `platform: browser`) + `npm pack --dry-run` contents check
- [ ] Audit M5 (§11.1)
