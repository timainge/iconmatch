# Changelog

All notable changes to the published packages. Versions follow [semver](https://semver.org); while below 1.0, minor versions may change the API.

## Unreleased

- Root README rewritten as the project landing page; package README links back to the repository, eval results and this changelog.

## @iconmatch/core 0.1.0 — 2026-10-03

First release.

- Semantic icon matching over Tabler's 5,166 outline icons (brands included): hybrid keyword (MiniSearch) + vector search (`bge-small-en-v1.5`, int8), fused with Reciprocal Rank Fusion.
- `best()` returns a lettered Tabler glyph when the top confidence is below `minConfidence` (default 0.65; keyword-only 0.50).
- Composable primitives (data sources, loaders, searchers, fusion, SVG rendering, fallback) and `createIconMatcher`; Node-only sources at `@iconmatch/core/node`; the local embedder at `@iconmatch/core/embedder-transformers` (optional peer dependency `@huggingface/transformers`).
- Optional query-expansion hook; `attributions()` for licence display.
- Reviewed eval (v2, held-out test): Hit@3 0.758, MRR 0.698, fallback recall 0.71.
