# Test fixtures

Small, committed inputs for the default test tier (spec §10). Nothing here is
fetched at test time; tests locate files with `fixturePath()` from
`test-support/fixtures.ts`.

| Path                 | Contents                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| `tabler-200/`        | ~200-icon subset of the real build artifacts (catalog, svgs, index)      |
| `lucide-subset.json` | Icon names kept by the Lucide CI build (`iconmatch.ci-lucide.config.ts`) |
| `ollama/`            | Recorded enrichment responses, replayed instead of calling Ollama        |
| `reference-vectors/` | Real-model reference embeddings checked by the slow tier                 |

Regenerate fixtures only with the pipeline scripts that produce them, and say
why in the commit message:

- `tabler-200/`: `npm run fixtures` (`packages/pipeline/scripts/make-fixtures.ts`).
  A default-tier test fails when the committed files drift from the installed
  Tabler packages or the keyword index options. Load it in tests with
  `loadTabler200()` from `test-support/tabler-200.ts`.
- `lucide-subset.json`: `npx tsx --conditions=source packages/pipeline/scripts/make-lucide-subset.ts`
  (every 20th visible Lucide icon plus all fallback glyphs and `shapes`).
- `reference-vectors/`: `npm run fixtures:vectors`
  (`packages/pipeline/scripts/make-reference-vectors.ts`, real model, q8).
  Checked by the slow tier; regenerate only when the model or dtype changes
  on purpose.
