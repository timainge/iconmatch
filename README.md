# iconmatch

[![npm](https://img.shields.io/npm/v/@iconmatch/core)](https://www.npmjs.com/package/@iconmatch/core)
[![CI](https://github.com/timainge/iconmatch/actions/workflows/ci.yml/badge.svg)](https://github.com/timainge/iconmatch/actions/workflows/ci.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](packages/core/LICENSE)

**Pick a sensible icon for a category your users named themselves.** Give iconmatch "Dog grooming", "Super contributions" or "Kids' ski gear" and it returns ranked icons from the [Tabler Icons](https://tabler.io/icons) outline set, each with a confidence score. When nothing fits, it returns a lettered glyph in the same style instead of a confident-looking wrong icon.

It's built for apps where people create their own lists, budgets, folders or projects and each one needs an icon: suggest a good default, and let the user pick from the next 20.

```text
query                 top 3 (confidence)                                  best()
Groceries             shopping-cart 0.78, brand-walmart 0.78, …           shopping-cart
Netflix               brand-netflix 0.85, badge-cc 0.62, cast-off 0.59    brand-netflix
Home insurance        home-lock 0.73, home-check 0.73, home-question 0.69 home-lock
Super contributions   tip-jar 0.66, tip-jar-euro 0.66, tip-jar-pound 0.66 tip-jar
Beekeeping            wash-eco 0.57, pig-off 0.56, pig 0.56               square-letter-b (fallback)
Misc                  shopping-cart-exclamation 0.55, receipt-yuan 0.55   square-letter-m (fallback)
```

<sub>Real output of `@iconmatch/core` 0.1.0 with its packaged data and default settings.</sub>

## Install

```sh
npm install @iconmatch/core
# Only for local semantic search (Node or desktop app), not in the browser:
npm install @huggingface/transformers
```

<!-- example: examples/readme/quick-start.ts -->

```ts
import {
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  loadVectors,
  svgsFromArtifact,
} from "@iconmatch/core";
import { createTransformersEmbedder } from "@iconmatch/core/embedder-transformers";
import { packagedSource } from "@iconmatch/core/node";

// Node: everything from the data shipped in the package, plus the local model
// (downloaded on the first text search, then cached).
const source = packagedSource();
const manifest = await loadManifest(source);
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source, { manifest }),
  keywordIndex: await loadKeywordIndex(source, { manifest }),
  vectors: await loadVectors(source, manifest),
  svgs: svgsFromArtifact(await loadSvgs(source, { manifest })),
  embedder: createTransformersEmbedder(),
  manifest,
});

const results = await matcher.search("Dog grooming", { limit: 5 });
const best = await matcher.best("Super contributions"); // may be a lettered fallback
const svg = await matcher.svg(best.id, { size: 24, title: best.label });

console.log(
  results.map((r) => `${r.id} (${r.confidence.toFixed(2)})`),
  best.isFallback,
  svg.length,
);
```

The [package README](packages/core/README.md) has the full API, the browser and offline set-ups, query expansion and how confidence works.

## Where it runs

The library is a set of small primitives, and you compose only the parts a deployment needs. Three reference compositions live in [`examples/`](examples), each type-checked and tested:

| Shape                                                                     | Use it when                                                                                            | Downloads                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Server** ([`examples/server`](examples/server))                         | You have a backend: it embeds queries, searches and serves SVGs over HTTP                              | data 6.3 MB + model 35 MB, on the server          |
| **Browser client** ([`examples/browser-client`](examples/browser-client)) | A web app: keyword search locally, semantic search from your server, still works if the server is down | catalog + keyword index, 0.4 MB gzipped; no model |
| **Offline desktop** ([`examples/local-full`](examples/local-full))        | A Tauri/Electron-style app that must work with no network                                              | everything bundled, model loaded from disk        |

## How it works

```text
build time (iconmatch-build)                       run time (@iconmatch/core)
─────────────────────────────                      ─────────────────────────────────────────────
Tabler SVGs + tags ─► catalog ─┬─► keyword index   query ─┬─► keyword search (top 50) ─┐
                               └─► embed (bge-small,      └─► embed query ─► cosine ───┴─► RRF fusion
                                   int8 vectors)                              (top 50)        │
                                                                                     confidence = cosine
                                                                                     (+0.1 if keyword hit)
                                                                                              │
                                                         best(): top result, or a lettered glyph if
                                                         confidence < minConfidence (default 0.65)
```

- **Hybrid ranking:** keyword search catches literal matches ("Netflix" → `brand-netflix`); the embedding model (`bge-small-en-v1.5`, quantised to int8) catches meaning ("Groceries" → `shopping-cart`). Reciprocal Rank Fusion combines the two lists.
- **Never confidently wrong:** below the threshold, `best()` returns Tabler's `square-letter-*` / `square-number-*` glyph for the label's first character, so the fallback looks like the rest of your icons.
- **Optional extras:** a query-expansion hook (e.g. a local LLM turning "Admin" into "clipboard, folder"), and a pipeline that can enrich icon metadata with a local LLM. Neither is on by default: the evaluation showed they didn't help ([details](DECISIONS.md)).

## Evaluation

Every ranking and threshold choice is measured on a human-reviewed set of 155 realistic category names, split into a tuning (dev) part and a held-out test part ([`eval/v2/queries.json`](eval/v2/queries.json)). Held-out results for the packaged defaults ([full table](eval/v2/results/2026-10-02.md)):

| Measure                                                     | Result | v1 target |
| ----------------------------------------------------------- | ------ | --------- |
| Hit@3: an acceptable icon in the top 3                      | 0.758  | ≥ 0.70    |
| MRR                                                         | 0.698  |           |
| Fallback recall: names with no suitable icon that fall back | 0.71   | ≥ 0.60    |
| Keyword-only Hit@3 (browser with the server down)           | 0.606  |           |

## Limitations

- **English only.** The embedding model and keyword index are English.
- **Abstract labels are hardest.** "Budget", "Goals" or "Admin" have no literal icon, and the ranking is weakest there (held-out Hit@3 0.50 for that group). Letting users override the suggestion matters.
- **Near-misses can beat the fallback.** A name close to a real icon ("Llama trekking" → `trekking`) gets that icon rather than a letter.
- **Brand icons** depict third-party trademarks; using them appropriately is up to your app.
- **One icon set for now:** Tabler outline. More sets are on the [roadmap](docs/plan.md#15-post-v1-work-v02).

## Development

```sh
npm install
npm run check                 # typecheck, lint, format check, default-tier tests (offline)
npm run test:slow             # real embedding model and full pipeline
npx iconmatch-build all       # build the data (see iconmatch.config.ts)
npx iconmatch-eval --table    # evaluation report on the current eval set
npm run readme                # sync README code blocks from examples/readme/
```

| Path                                     | What                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| [`packages/core`](packages/core)         | `@iconmatch/core`, the published library and its data                    |
| [`packages/pipeline`](packages/pipeline) | `iconmatch-build`: ingest → enrich → embed → index → package             |
| [`eval`](eval)                           | `iconmatch-eval`, the eval sets and results                              |
| [`examples`](examples)                   | Reference compositions: server, browser client, offline, query expansion |
| [`docs/plan.md`](docs/plan.md)           | The spec, including the post-v1 roadmap                                  |
| [`DECISIONS.md`](DECISIONS.md)           | Every judgement call and measured result, newest last                    |

This project was built by an autonomous coding agent working from the spec, with the owner reviewing the eval set and checkpoints; `docs/progress.md` and `docs/audits/` are its working records.

## Licences

iconmatch's code is [MIT](packages/core/LICENSE). The bundled icons are from [Tabler Icons](https://github.com/tabler/tabler-icons) (MIT); the embedding model [`Xenova/bge-small-en-v1.5`](https://huggingface.co/Xenova/bge-small-en-v1.5) is downloaded separately under its own licence.
