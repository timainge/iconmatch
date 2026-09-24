# Spec: `iconmatch` — semantic icon matching for user-defined categories

> Working name `iconmatch`; rename freely. This document is the source of truth for the build. Where it says **MUST**, treat it as a requirement; **SHOULD** is a strong default you may deviate from with a written reason in `DECISIONS.md`.
>
> The build is carried out by an autonomous agent loop (§14). This file is **human-owned**: the agent never edits it. If the agent finds the spec wrong, ambiguous or contradictory, it picks the most conservative reading, records it in `DECISIONS.md` under a `SPEC-QUESTION` heading, and keeps going.

## 1. Problem

An application lets users create their own categories of things (e.g. "Dog grooming", "Super contributions", "Kids' ski gear"). Each category needs an icon because a text label alone doesn't scan well. We want to automatically suggest a sensible icon from a free, visually cohesive line-icon set, given only the category name (or a precomputed embedding), and let the user override it.

The match doesn't need to be perfect. It needs to be **plausible, fast, offline-capable, and never confidently wrong** — when nothing fits, return a neutral fallback rather than a misleading icon.

## 2. Goals and non-goals

### Goals

1. An npm library (TypeScript, ESM, Node 20+ and modern browsers) that takes a text query or an embedding vector and returns ranked icon matches with a confidence score.
2. A build pipeline that produces the library's data artifacts from open-source icon packages and their metadata.
3. Optional enrichment of icon metadata with a local LLM / vision model to improve recall for abstract or long-tail categories.
4. An evaluation harness that measures match quality so every pipeline change can be judged on numbers.
5. Support for variants (outline, filled) of the same base concept, with graceful fallback when a variant doesn't exist.

### Non-goals (v1)

- Generating new icons or new variants. The pipeline only labels existing icons.
- Mixing many visually different icon sets. v1 ships **one** set.
- A hosted service, UI, or icon picker component. (The consuming app builds its own picker using the search API.)
- Multilingual queries. English only in v1.
- Cross-set deduplication (only needed once a second set is added; see §12).

## 3. Key decisions (already made)

| Decision                            | Choice                                                                                                  | Rationale                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Primary icon set                    | **Tabler Icons** (outline, plus filled where available)                                                 | ~5,100 outline + ~1,050 filled, MIT, single consistent 24px/2px-stroke style, has tags and categories |
| Source of SVG data                  | `@iconify/json` (or `@iconify-json/tabler`)                                                             | Already cleaned, normalised to `currentColor`, updated regularly. Do not crawl websites.              |
| Source of tags/categories           | The icon library's own metadata (Tabler repo/package)                                                   | Iconify's per-icon tag data is thin                                                                   |
| Embedding model                     | `bge-small-en-v1.5` (384-dim) via `@huggingface/transformers` (transformers.js), quantised              | Small, runs locally in Node and browser, good retrieval quality                                       |
| Keyword search                      | FlexSearch or MiniSearch (pick one; MiniSearch preferred for BM25-style scoring and serialisable index) | Lightweight, serialisable                                                                             |
| Ranking                             | Hybrid: keyword + vector, fused with Reciprocal Rank Fusion (RRF)                                       | Pure vector search on sparse metadata returns confident nonsense                                      |
| Local LLM runtime (enrichment only) | Ollama                                                                                                  | Simple local HTTP API; swappable                                                                      |
| Enrichment models                   | Text: a 7–8B instruct model (e.g. `qwen2.5:7b-instruct`). Vision: `qwen2.5vl:7b` or `gemma3`            | Local, free, good enough for labelling                                                                |
| SVG rasterisation                   | `@resvg/resvg-js`                                                                                       | No browser needed                                                                                     |

The architecture MUST keep the icon set behind an adapter interface (§6.1) so Phosphor or Lucide can be added later without touching search code.

## 4. Architecture overview

```
┌──────────────────── build time (CLI, Node) ────────────────────┐
│                                                                 │
│  ingest ──► enrich (optional) ──► embed ──► index ──► package   │
│    │            │                   │         │          │      │
│  catalog     enrichment          vectors   keyword    dist/data │
│  .json       cache (.jsonl)      .bin      index.json  + manifest│
└─────────────────────────────────────────────────────────────────┘

┌──────────────────── runtime (library) ─────────────────────────┐
│  createIconMatcher() loads manifest + catalog + vectors + index │
│  search(text) ─► [optional expand] ─► keyword hits              │
│                                    ─► embed query ─► cosine hits│
│                                    ─► RRF fuse ─► confidence    │
│                                    ─► results / fallback        │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Repository layout

```
iconmatch/
  packages/
    core/                 # runtime library (published to npm)
      src/
        index.ts          # public API
        matcher.ts
        keyword.ts
        vector.ts         # cosine over int8/float32
        fuse.ts           # RRF + confidence
        embedder.ts       # transformers.js wrapper, lazy-loaded
        types.ts
      data/               # generated artifacts copied here at package time
    pipeline/             # build CLI (not published, or published separately)
      src/
        cli.ts
        adapters/
          types.ts
          tabler.ts
        ingest.ts
        enrich/
          text.ts
          vision.ts
          prompts.ts
          schema.ts       # zod schemas
        render.ts         # SVG -> PNG
        embed.ts
        index.ts
        package.ts
      cache/              # gitignored: enrichment cache, rendered PNGs
    eval/
      queries.json        # evaluation set (§9)
      src/run.ts
  DECISIONS.md
  README.md
```

Use npm workspaces (`packages/*`, `eval`). TypeScript strict mode. Vitest for tests.

## 6. Build pipeline

Each stage is a CLI subcommand, is idempotent, reads the previous stage's output from disk, and can be re-run on its own.

```
iconmatch-build ingest
iconmatch-build enrich --mode text|vision|none [--limit N] [--model NAME]
iconmatch-build embed
iconmatch-build index
iconmatch-build package
iconmatch-build all   # runs the above in order; enrich mode from config
iconmatch-eval [--config baseline|enriched|...]
```

Configuration lives in `iconmatch.config.ts` at the repo root (sets to include, enrich mode, model names, Ollama URL, output paths).

### 6.1 Adapter interface

```ts
export interface IconSetAdapter {
  /** Short stable id, e.g. "tabler". Used as the id prefix. */
  id: string;
  license: { spdx: string; url: string; attributionRequired: boolean };
  /** Variants this set supports, in preference order. First is the default. */
  variants: VariantName[]; // e.g. ["outline", "filled"]
  load(): Promise<RawIcon[]>;
}

export type VariantName =
  "outline" | "filled" | "thin" | "light" | "bold" | "duotone";

export interface RawIcon {
  /** Base concept name, kebab-case, WITHOUT variant suffix, e.g. "heart". */
  name: string;
  /** SVG body (inner markup) + viewBox per available variant. */
  variants: Partial<
    Record<VariantName, { body: string; width: number; height: number }>
  >;
  tags: string[]; // from the source library, lowercase, deduped
  categories: string[]; // from the source library
  deprecated?: boolean;
}
```

**Tabler adapter requirements:**

1. Load SVG bodies from `@iconify-json/tabler`. In Iconify, filled icons appear as `<name>-filled`; the adapter MUST fold these into the `filled` variant of the base concept `<name>`.
2. Load tags and categories from Tabler's own metadata. The agent MUST locate the authoritative source (check the `@tabler/icons` npm package for a JSON metadata file with name/category/tags; if not present, the Tabler GitHub repo's source SVGs carry tag/category metadata in a comment block). Record which source was used in `DECISIONS.md`.
3. Skip hidden/deprecated icons, and skip brand icons (`brand-*`) by default (configurable). Brand logos are trademarks and poor category icons.
4. Log counts: total base concepts, concepts with filled variant, concepts with zero tags.

### 6.2 `ingest`

Output: `build/catalog.json`

```ts
interface CatalogEntry {
  id: string; // "tabler:heart"
  set: string; // "tabler"
  name: string; // "heart"
  label: string; // "Heart" (humanised name)
  tags: string[];
  categories: string[];
  variants: VariantName[]; // which variants exist
  license: string; // spdx
}
```

SVG bodies go in a separate file, `build/svgs.json`, keyed by `id` then variant, so runtime can load them lazily.

### 6.3 `enrich` (optional)

Purpose: add concepts and synonyms the source metadata lacks. For example, a `shield` icon should be findable by "insurance", "security" and "protection"; `piggy-bank` by "savings" and "super".

**Modes**

- `none`: skip. The build must still work.
- `text`: prompt a text LLM with name + tags + categories. Cheap; run this first.
- `vision`: render the default variant to a 256×256 PNG (black on white, 2px stroke scaled appropriately) and send image + name + tags to a vision model. Use when names are cryptic or tags are empty.

A config option `enrich.visionFor: "all" | "sparse"` SHOULD exist; `sparse` runs vision only for icons with fewer than 3 tags or names that fail a simple readability check, and text for the rest.

**Output schema (validate with zod; reject and retry up to 2 times on failure):**

```ts
interface Enrichment {
  id: string;
  description: string; // literal, 1 sentence: what is drawn. Max 160 chars.
  concepts: string[]; // 5–15 things this icon could represent, incl. metaphors
  domains: string[]; // 1–5 broad areas: "finance", "pets", "sport", ...
  model: string; // model name + tag used
  mode: "text" | "vision";
  promptVersion: string; // bump when prompts change
  inputHash: string; // hash of (svg body + tags + promptVersion + model)
}
```

**Prompt requirements (put prompts in `prompts.ts`, versioned):**

1. System prompt states the task: label an icon so it can be found when someone searches for a category name in a personal organisation app.
2. `description` MUST describe only what is visibly drawn (vision) or clearly implied by the name (text). No speculation.
3. `concepts` SHOULD include common metaphorical uses (lightbulb → idea, anchor → stability) and everyday category names a user might type, lowercase, 1–3 words each.
4. Output MUST be JSON only, matching the schema. Use Ollama's `format` parameter with the JSON schema where supported.
5. Include 3 few-shot examples covering a literal object, an abstract symbol, and a UI/action glyph (which should get few everyday concepts, e.g. `arrow-bar-to-down`).

**Caching and resumability:**

- Append results to `pipeline/cache/enrichment.jsonl`. Before calling the model, look up by `inputHash`; skip if present.
- `--limit N` processes only N uncached icons, for smoke tests.
- Concurrency configurable (default 2). Handle Ollama errors with exponential backoff.
- Enrichment runs once per **base concept**, never per variant.

**Trust model:** source tags are authoritative; enrichment is supplementary. This is reflected in index weighting (§6.5), not by discarding either.

### 6.4 `embed`

- Model: `Xenova/bge-small-en-v1.5` (or the current transformers.js-compatible repo for that model; record the exact id in the manifest), mean-pooled and L2-normalised as the model card specifies.
- **Document text** per icon, composed deterministically:
  ```
  {label}. Tags: {tags joined ", "}. Category: {categories}. {description} Represents: {concepts joined ", "}. Domains: {domains}.
  ```
  Omit empty sections. Documents get no instruction prefix.
- **Query text** at runtime uses the model's recommended retrieval query prefix for bge (`"Represent this sentence for searching relevant passages: "`). This MUST be defined once in shared code so build and runtime cannot drift.
- Store vectors quantised to int8 with a per-vector scale (or a global scale if accuracy is equivalent in eval) in `build/vectors.bin`, row order matching `build/vector-ids.json`. Keep a float32 path behind a flag for comparison.

### 6.5 `index`

Build a keyword index (MiniSearch preferred) over fields with boosts:

| Field                      | Boost (starting point, tune with eval) |
| -------------------------- | -------------------------------------- |
| `label` / name tokens      | 3                                      |
| `tags`                     | 2                                      |
| `categories`               | 1                                      |
| `concepts` (enrichment)    | 1.5                                    |
| `description` (enrichment) | 0.5                                    |

Enable prefix and light fuzzy matching (edit distance 1 for terms ≥5 chars). Include a small stopword list. Apply basic stemming (or plural folding at minimum: "dogs" → "dog"). Serialise to `build/keyword-index.json`.

### 6.6 `package`

Copy artifacts into `packages/core/data/` and write `manifest.json`:

```json
{
  "schemaVersion": 1,
  "builtAt": "ISO timestamp",
  "sets": [
    { "id": "tabler", "version": "x.y.z", "license": "MIT", "count": 0 }
  ],
  "embedding": {
    "model": "Xenova/bge-small-en-v1.5",
    "dims": 384,
    "quantisation": "int8",
    "queryPrefix": "..."
  },
  "enrichment": {
    "mode": "text|vision|none",
    "model": "...",
    "promptVersion": "..."
  },
  "files": {
    "catalog": "catalog.json",
    "svgs": "svgs.json",
    "vectors": "vectors.bin",
    "vectorIds": "vector-ids.json",
    "keywordIndex": "keyword-index.json"
  }
}
```

Log final artifact sizes. Target: total data ≤ 8 MB uncompressed, excluding SVGs ≤ 4 MB.

## 7. Runtime library API

```ts
import { createIconMatcher } from "iconmatch";

const matcher = await createIconMatcher({
  variant: "outline", // preferred variant; falls back to set default
  embedder: "auto", // "auto" | "none" | custom Embedder
  minConfidence: 0.5, // below this, best() returns the fallback. Default set from eval.
  expandQuery: undefined, // optional async (q) => string[]  (§7.3)
  dataUrl: undefined, // browser: where to fetch artifacts from; Node: read from package
});

const results = await matcher.search("Dog grooming", { limit: 5 });
// -> IconMatch[]

const best = await matcher.best("Super contributions");
// -> IconMatch (possibly the fallback, with isFallback: true)

const byVec = matcher.searchByEmbedding(float32Array384, { limit: 5 });
// No model load needed. MUST validate dims against manifest and throw a clear error on mismatch.

const icon = matcher.get("tabler:heart");
const svg = await matcher.svg("tabler:heart", {
  variant: "filled",
  size: 24,
  strokeWidth: 2,
});
```

### 7.1 Types

```ts
interface IconMatch {
  id: string;
  name: string;
  label: string;
  set: string;
  score: number; // fused RRF score, for ranking only
  confidence: number; // 0..1, see 7.2; use this for thresholds
  variant: VariantName; // variant that will be rendered (after fallback)
  availableVariants: VariantName[];
  matchedOn: { keyword: boolean; vector: boolean };
  isFallback?: boolean;
}

interface Embedder {
  modelId: string; // MUST match manifest.embedding.model or createIconMatcher throws
  embed(texts: string[], kind: "query" | "document"): Promise<Float32Array[]>;
}
```

### 7.2 Ranking and confidence

1. Normalise the query: trim, lowercase, collapse whitespace, strip possessives and punctuation (keep hyphens). Keep the raw query for embedding.
2. Keyword search: top 50.
3. Vector search: embed the query (with prefix), cosine against all vectors (brute force is fine at ~5k × 384), top 50.
4. Fuse with RRF: `score = Σ 1 / (k + rank)`, `k = 60`.
5. `confidence` is **not** the RRF score (RRF isn't calibrated). Define `confidence = cosine similarity of that icon to the query`, bumped when it also matched on keyword: `min(1, cosine + 0.1)` if keyword-matched. The exact formula is a tunable; the eval (§9) MUST be used to choose the default `minConfidence`.
6. Tie-break: prefer icons that have the requested variant, then shorter names (more generic concepts).
7. If `embedder: "none"` and no embedding is supplied, run keyword-only and set confidence from normalised keyword score. Document that quality is lower.

### 7.3 Query expansion (optional hook)

Short abstract labels ("Admin", "Misc", "Life") embed poorly. Provide an optional `expandQuery(q) => Promise<string[]>` hook. When set, search runs for the original query plus each expansion, and results are fused with RRF, weighting the original query ×2. The library MUST NOT ship an LLM. Provide an example in the README showing expansion via Ollama or any chat API, prompted to return 2–3 concrete objects that could visually represent the category.

### 7.4 Fallback

`best()` returns a fallback when the top result's confidence is below `minConfidence`. The fallback is configurable (`fallbackIcon: "tabler:category"` default; pick a neutral glyph from the set and record the choice). The consuming app can alternatively render a lettered badge; expose `isFallback` so it can.

### 7.5 Loading and performance

- The embedding model MUST lazy-load on first text query, not at `createIconMatcher()`. `searchByEmbedding` and `get`/`svg` must never trigger a model load.
- SVG bodies MUST load lazily (separate file) so search-only use doesn't pay for them.
- Targets (Node, M-series Mac): warm query ≤ 30 ms excluding embedding; embedding ≤ 50 ms; cold model load reported but not gated.
- Browser: artifacts fetched from `dataUrl`; model fetched from the Hugging Face hub or a configurable mirror.

### 7.6 SVG output

`svg()` returns a complete `<svg>` string with `viewBox`, `width`/`height` from `size`, `fill`/`stroke` as `currentColor` according to the variant, and `stroke-width` applied to outline variants only. `aria-hidden="true"` by default; accept `title` to switch to `role="img"` with a `<title>`.

## 8. Licensing

- Store `license` per entry and per set in the manifest.
- The package README MUST include the Tabler MIT notice, and the build MUST copy each set's license file into `packages/core/data/licenses/`.
- Adapters for sets requiring attribution MUST set `attributionRequired: true`, and `matcher.attributions()` returns the list the consuming app must display.

## 9. Evaluation

This is required for v1, not optional. Without it, enrichment and threshold tuning are guesswork.

### 9.1 Eval set: `eval/queries.json`

At least **120** queries, written to resemble real user category names, spread across:

- concrete objects/activities ("Bike maintenance", "Groceries", "Dog grooming")
- abstract/financial/admin ("Super contributions", "Tax", "Insurance", "Subscriptions")
- hobbies and long-tail ("Pottery", "Beekeeping", "Ski training")
- home and life admin ("Home build", "School stuff", "Medical" as a generic label)
- deliberately hard/vague ("Misc", "Stuff to sort", "Life")
- at least 10 that have **no** good icon in the set (to test the fallback)

```ts
interface EvalQuery {
  query: string;
  acceptable: string[]; // icon ids judged acceptable; empty = should fall back
  ideal?: string; // single best, optional
  group: string;
}
```

The agent drafts the set and the acceptable ids by browsing the catalog, then flags it for human review. The eval set is versioned; don't tune on it and then report on it without noting that.

Because tuning is done by an agent, the set MUST be split to keep reported numbers honest:

- Each query carries `split: "dev" | "test"`, about 70/30 and stratified by `group` (fallback queries included in both).
- All tuning (boosts, confidence formula, `minConfidence`, prompts) uses `dev` only. Headline numbers and the acceptance bar are reported on `test`.
- Every acceptable id MUST exist in the current catalog; the eval CLI fails loudly on unknown ids.
- Once a human has reviewed the set (signalled by the file `eval/REVIEWED`), the agent MUST NOT edit `eval/queries.json`. Suspected labelling errors go in `eval/label-issues.md` for the human.

### 9.2 Metrics

- Hit@1, Hit@3, Hit@5 (any acceptable id in top k)
- MRR
- Fallback precision/recall: for empty-`acceptable` queries, did `best()` fall back? For non-empty ones, did it wrongly fall back?
- Per-group breakdown

### 9.3 Configurations to compare

Output one markdown table in `eval/results/<date>.md`:

1. keyword only, no enrichment
2. vector only, no enrichment
3. hybrid, no enrichment (**baseline**)
4. hybrid + text enrichment
5. hybrid + text + vision enrichment
6. (5) + query expansion (if an expander is configured)
7. int8 vs float32 vectors on the best config

Also output a threshold sweep for `minConfidence` (0.3–0.8, step 0.05) showing fallback precision/recall so the default can be chosen.

**Acceptance bar for v1 (best config):** Hit@3 ≥ 0.70 on non-fallback queries; fallback recall ≥ 0.6 at the chosen threshold. If not met, report what's failing by group rather than tuning blindly.

### 9.4 Regression discipline

- `iconmatch-eval` writes machine-readable results to `eval/results/<date>-<config>.json` next to the markdown table, and `eval/results/baseline.json` holds the most recent accepted numbers per config.
- `iconmatch-eval --compare baseline` prints deltas and exits non-zero if dev Hit@3 or MRR drops by more than 0.02 for any config that was run.
- Any change to ranking, indexing, embedding text, enrichment prompts or confidence MUST be followed by an eval run on `dev`. A regression beyond the tolerance is either fixed or accepted with a `DECISIONS.md` entry and a baseline update in the same commit.

## 10. Testing

Tests run in two tiers so the default loop stays fast and offline-safe:

- **Default** (`npm test`, part of `npm run check`): no network, no model downloads, no Ollama, finishes in well under a minute. Uses a deterministic fake `Embedder` (hash-based, correct dims) and small committed fixtures (a ~200-icon catalog subset, recorded Ollama responses).
- **Slow** (`npm run test:slow`, sets `ICONMATCH_SLOW_TESTS=1`): may download the real embedding model (cached outside the repo) and run the real pipeline. Tests in this tier are skipped unless the env var is set. Run them at each milestone audit and whenever embedding code changes.

Core stays browser-safe: `packages/core/src` MUST NOT import `node:*` modules or Node-only packages, except in files named `*.node.ts` that are only reached via a runtime check or a conditional export. ESLint enforces this.

- Unit: RRF, cosine (int8 and float32), query normalisation, variant fallback, manifest/embedder mismatch error, zod enrichment validation.
- Adapter: Tabler adapter folds `-filled` correctly; counts are within expected ranges; no brand icons by default.
- Snapshot: `svg()` output for 3 icons × 2 variants.
- Integration: build with `--enrich none` on a 200-icon subset in CI (no Ollama in CI; enrichment tests use recorded fixtures).
- Determinism: running `ingest` + `embed` twice produces identical artifacts (hash compare).

## 11. Milestones

1. **M1: Ingest + keyword search.** Tabler adapter, catalog, keyword index, `search()` keyword-only, `svg()`. Tests pass.
2. **M2: Vectors + hybrid.** Embedding at build and runtime, RRF, confidence, `searchByEmbedding`, lazy loading.
3. **M3: Eval harness.** Eval set drafted, results table for configs 1–3, threshold sweep.
4. **M4: Enrichment.** Text mode, cache, then vision mode with rendering; eval configs 4–5.
5. **M5: Package.** Query expansion hook, README with examples, licenses, size report, publish-ready `package.json`.

Stop and report after M3 with the baseline numbers before starting M4.

### 11.1 Milestone acceptance (verification)

A milestone is done only when every checklist item is ticked **and** a milestone audit has confirmed the criteria below, with evidence (test names, command output, numbers) written to `docs/audits/M<n>.md`. `npm run check` must be green throughout.

- **M1**
  - Adapter test proves `-filled` folding, no `brand-*` by default, no deprecated icons, and counts within ranges (outline concepts 4,500–6,000; with filled 800–1,300).
  - `iconmatch-build ingest` and `index` run from a clean checkout and produce the §6.2/§6.5 files.
  - Keyword `search()` returns a plausible top 3 for a smoke set ("dog", "heart", "money", "car", "calendar"), asserted in a test against the fixture catalog.
  - `svg()` snapshot tests cover 3 icons × 2 variants, plus `title` and variant fallback.
- **M2**
  - The query prefix exists in exactly one module and is imported by both build and runtime (checked by a test).
  - Slow tier: real-model embedding of a fixed sentence matches a committed reference vector (cosine ≥ 0.999). The determinism test passes.
  - Tests prove that `searchByEmbedding`, `get` and `svg` never load the model (spy on the lazy loader), and that wrong dims or a wrong `modelId` throw clear errors.
  - `npm run bench` reports warm query latency and embedding latency against the §7.5 targets. Reported, not gated.
- **M3**
  - `eval/queries.json` has ≥120 queries, ≥10 fallback queries, every group from §9.1, and a dev/test split. Every id resolves.
  - `eval/results/<date>.md` holds configs 1–3 and the threshold sweep; `baseline.json` is written.
  - `docs/checkpoints/M3.md` summarises the numbers, failing groups, and the queries most worth a human look.
- **M4**
  - Enrichment tests (zod rejection, retry, cache hit by `inputHash`, `--limit`) pass on recorded fixtures.
  - Configs 4–5 are in the results table with deltas against the baseline.
- **M5**
  - `npm pack --dry-run` in `packages/core` lists only the intended files. Data size is within §6.6 targets or the overage is recorded.
  - Core bundles for `platform: "browser"` (esbuild) without Node built-ins.
  - A CI workflow file runs `npm run check` and the 200-icon `--enrich none` build. It is written but not pushed.
  - The README examples are type-checked or executed by a test.

## 12. Future (explicitly out of scope for v1)

- Second set (Lucide as a near-sibling style, or Phosphor for 6 weights). Requires cross-set dedup by concept and a style-compatibility decision.
- Per-app learning: record user overrides (query → chosen icon) and boost those in future ranking.
- Multi-vector docs (separate vectors for literal description vs concepts, max-sim).
- Multilingual embedding model.

## 13. Open questions for the human

The agent proceeds on the stated default for each question and records it in `DECISIONS.md`. The human may override a default at any checkpoint.

1. Include brand icons at all? **Default: no** (configurable, off).
2. Is the filled variant needed at launch, or only outline? **Default: ship both.** Outline is the default variant.
3. Browser use: acceptable to fetch a ~30 MB embedding model on first query, or must browser use rely on `searchByEmbedding` with server-side embedding? **Default: support both.** `embedder: "auto"` lazy-fetches in the browser, and the README documents the server-side `searchByEmbedding` path as the lighter option.
4. Fallback: neutral glyph from the set, or lettered badge in the app? **Default: neutral glyph** (`tabler:category`), with `isFallback` exposed so the app can draw a badge instead.

## 14. Autonomous execution

The build is driven by an agent running `/next` in a loop (see `CLAUDE.md`). Constraints the loop MUST respect:

- **Progress** lives in `docs/progress.md`, **judgement calls** in `DECISIONS.md`, **milestone evidence** in `docs/audits/`, and **human handoffs** in `docs/checkpoints/`.
- **Every commit is green.** `npm run check` passes before each commit. Tests and lint rules are never weakened to get there.
- **Human checkpoints:** after M3 (baseline numbers and eval set review), and before any outward-facing or irreversible action (push, publish, deleting data outside `build/` and `cache/`).
- **Blockers don't stop the loop.** A blocked item is marked `BLOCKED: <reason>` and the loop moves on to the next unblocked item. Later work that truly depends on it is also marked blocked. Local, free resources count as available: npm packages, Hugging Face model downloads, and local LLM runtimes.
- **Local LLM runtime for M4:** the agent MAY install and start one itself: `brew install ollama`, then `ollama serve` in the background, then `ollama pull` of the configured models. LM Studio (`lms` CLI, OpenAI-compatible server on `:1234`) is an accepted alternative. The enrichment client talks to one small provider interface with an Ollama implementation and an OpenAI-compatible implementation, selected in `iconmatch.config.ts`. It MUST still be written and tested against recorded fixtures first, and the runtime is only needed for real enrichment runs. It is a blocker only if installation fails or the machine can't run a 7–8B model at a usable speed (record timings in `DECISIONS.md`).
- **External facts** (package contents, metadata locations, model ids) are verified by inspecting the installed package or source, never assumed. The finding and its source go in `DECISIONS.md`.
