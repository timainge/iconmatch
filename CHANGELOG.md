# Changelog

All notable changes to the published packages. Versions follow [semver](https://semver.org); while below 1.0, minor versions may change the API.

## Unreleased

- **Choice learning:** `createChoiceMemory()`, the `choices` matcher part and `matcher.recordChoice(query, iconId)`. Exact repeats return the user's pick first; with an embedder, picks for similar names rank higher. `IconMatch.matchedOn.choice` marks them.
- **Embedding model profiles:** `EMBEDDING_PROFILES` / `findEmbeddingProfile()` (pooling and prefixes per model). The transformers embedder applies its model's profile and needs an explicit `profile` for unregistered models. The manifest may record `embedding.pooling` and `embedding.documentPrefix`.
- **Per-set neutral fallback:** `manifest.sets[].fallbackIcon`; the matcher defaults `fallbackIcon` to it.
- **New package `@iconmatch/lucide`:** Lucide icon data with Lucide-style lettered fallback glyphs.
- **Confidence:** the +0.1 keyword bump now needs a keyword hit on a source field (label, name, tags, categories); matches on enrichment text alone don't earn it. No change for the packaged (unenriched) data.
- **Pipeline (experimental):** `iconmatch-build generate` drafts icons for missing concepts with a local LLM, validates and normalises them to the set's stroke style, and builds a review gallery; approved icons form an opt-in `generated` set. A vision judge (`iconmatch-eval --judge`) measures how well a local vision model agrees with the eval labels.
- **Pipeline:** `enrich.applyTo` (`both` | `index` | `embed`) and learned concepts from users' choice exports (`enrich.learnedFrom`, `enrich.learnedMinUsers`).

- Root README rewritten as the project landing page; package README links back to the repository, eval results and this changelog.

## @iconmatch/core 0.1.0 — 2026-10-03

First release.

- Semantic icon matching over Tabler's 5,166 outline icons (brands included): hybrid keyword (MiniSearch) + vector search (`bge-small-en-v1.5`, int8), fused with Reciprocal Rank Fusion.
- `best()` returns a lettered Tabler glyph when the top confidence is below `minConfidence` (default 0.65; keyword-only 0.50).
- Composable primitives (data sources, loaders, searchers, fusion, SVG rendering, fallback) and `createIconMatcher`; Node-only sources at `@iconmatch/core/node`; the local embedder at `@iconmatch/core/embedder-transformers` (optional peer dependency `@huggingface/transformers`).
- Optional query-expansion hook; `attributions()` for licence display.
- Reviewed eval (v2, held-out test): Hit@3 0.758, MRR 0.698, fallback recall 0.71.
