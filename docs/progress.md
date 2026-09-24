# Progress

Checklist derived from `docs/plan.md` §11. The spec is the source of truth for _what_; this file tracks _where we are_. Split items as needed; mark blocked items `- [ ] BLOCKED: <reason>`.

## M1: Ingest + keyword search

- [ ] Adapter interface + types (§6.1)
- [ ] Tabler adapter: SVGs from `@iconify-json/tabler`, fold `-filled`, skip brand/deprecated, log counts; locate tag/category source and record in DECISIONS.md
- [ ] `ingest` → `build/catalog.json` + `build/svgs.json`
- [ ] `index` → MiniSearch keyword index with field boosts, fuzzy/prefix, stopwords, plural folding
- [ ] Runtime: `createIconMatcher`, keyword-only `search()`, `get()`, query normalisation
- [ ] `svg()` output per §7.6 + snapshot tests
- [ ] Build CLI (`iconmatch-build`) + `iconmatch.config.ts`

## M2: Vectors + hybrid

- [ ] Shared query prefix constant; embedder wrapper (lazy-loaded)
- [ ] `embed` → int8 `vectors.bin` + `vector-ids.json` (float32 flag)
- [ ] Cosine (int8/float32), RRF fuse, confidence, tie-breaks, fallback
- [ ] `searchByEmbedding` with dims validation; embedder/manifest mismatch error
- [ ] Determinism test (ingest + embed twice → identical hashes)

## M3: Eval harness

- [ ] Draft ≥120 eval queries (incl. ≥10 no-match) — flag for human review
- [ ] `iconmatch-eval`: Hit@1/3/5, MRR, fallback P/R, per-group
- [ ] Results table for configs 1–3 + `minConfidence` sweep → `eval/results/<date>.md`
- [ ] **HUMAN CHECKPOINT: stop and report baseline numbers before M4**

## M4: Enrichment

- [ ] Text enrichment via Ollama: prompts, zod schema, retries, jsonl cache, `--limit`, concurrency/backoff
- [ ] Vision enrichment: resvg render, `visionFor: sparse|all`
- [ ] Eval configs 4–5

## M5: Package

- [ ] Query expansion hook + eval config 6/7
- [ ] `package` stage: manifest, licenses, size report
- [ ] README with examples + Tabler MIT notice; publish-ready `package.json`
- [ ] CI: build with `--enrich none` on 200-icon subset
