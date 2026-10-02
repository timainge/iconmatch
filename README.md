# iconmatch

Semantic icon matching for user-defined categories. The published library and its documentation live in [`packages/core`](packages/core/README.md).

| Path                | What                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `packages/core`     | The `@iconmatch/core` library (published)                                   |
| `packages/pipeline` | `iconmatch-build`: ingest → enrich → embed → index → package                |
| `eval`              | `iconmatch-eval` and the evaluation set                                     |
| `examples`          | Reference compositions: server, browser client, local-full, query expansion |
| `docs/plan.md`      | The spec                                                                    |

```sh
npm install
npm run check                 # typecheck, lint, format, default-tier tests
npx iconmatch-build all       # build the data (see iconmatch.config.ts)
npx iconmatch-eval --table    # evaluation report
npm run readme                # sync README examples from examples/readme/
```
