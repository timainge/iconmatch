# Test fixtures

Small, committed inputs for the default test tier (spec §10). Nothing here is
fetched at test time; tests locate files with `fixturePath()` from
`test-support/fixtures.ts`.

| Path                 | Contents                                                            |
| -------------------- | ------------------------------------------------------------------- |
| `tabler-200/`        | ~200-icon subset of the real build artifacts (catalog, svgs, index) |
| `ollama/`            | Recorded enrichment responses, replayed instead of calling Ollama   |
| `reference-vectors/` | Real-model reference embeddings checked by the slow tier            |

Regenerate fixtures only with the pipeline scripts that produce them, and say
why in the commit message:

- `tabler-200/`: `npm run fixtures` (`packages/pipeline/scripts/make-fixtures.ts`).
  A default-tier test fails when the committed files drift from the installed
  Tabler packages or the keyword index options. Load it in tests with
  `loadTabler200()` from `test-support/tabler-200.ts`.
