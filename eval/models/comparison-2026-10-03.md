# Embedding model comparison (spec §15.3), 2026-10-03

Same Tabler data (no enrichment) embedded with each model and evaluated on the reviewed **v2 dev** split (78 queries with acceptable icons, 30 that should fall back), hybrid (keyword + vector, RRF). Fallback separation is measured threshold-free (AUC: how well the top confidence separates fallback queries from the rest) and at each model's own best dev threshold, because confidence scales differ by model. Test was not consulted: no candidate beat the default on dev.

| model                                   | dims | q8 ONNX | dev Hit@3 | dev MRR   | fallback AUC | best fallback F1 (threshold) | warm query (median) |
| --------------------------------------- | ---- | ------- | --------- | --------- | ------------ | ---------------------------- | ------------------- |
| **Xenova/bge-small-en-v1.5** (default)  | 384  | 34 MB   | 0.731     | **0.639** | 0.971        | **0.903** (0.65)             | 1.8 ms              |
| Xenova/bge-base-en-v1.5                 | 768  | 110 MB  | 0.692     | 0.595     | **0.982**    | 0.885 (0.66)                 | 3.2 ms              |
| Xenova/bge-large-en-v1.5                | 1024 | 337 MB  | 0.744     | 0.613     | 0.968        | 0.867 (0.69)                 | 8.6 ms              |
| Xenova/gte-small                        | 384  | 34 MB   | **0.756** | 0.636     | 0.947        | 0.789 (0.92)                 | 1.1 ms              |
| Xenova/gte-base                         | 768  | 110 MB  | 0.731     | 0.618     | 0.935        | 0.769 (0.88)                 | 2.5 ms              |
| Xenova/all-MiniLM-L6-v2                 | 384  | 23 MB   | 0.692     | 0.618     | 0.894        | 0.754 (0.40)                 | 0.6 ms              |
| mixedbread-ai/mxbai-embed-xsmall-v1     | 384  | 24 MB   | 0.692     | 0.607     | 0.891        | 0.754 (0.41)                 | 0.6 ms              |
| Snowflake/snowflake-arctic-embed-xs     | 384  | 23 MB   | 0.679     | 0.580     | 0.946        | 0.812 (0.63)                 | 0.8 ms              |
| Snowflake/snowflake-arctic-embed-s      | 384  | 34 MB   | 0.692     | 0.576     | 0.956        | 0.852 (0.64)                 | 1.6 ms              |
| Snowflake/snowflake-arctic-embed-m-v1.5 | 768  | 110 MB  | 0.679     | 0.607     | 0.956        | 0.811                        | 3.0 ms              |
| nomic-ai/nomic-embed-text-v1.5          | 768  | 137 MB  | 0.679     | 0.594     | 0.960        | 0.833 (0.64)                 | 3.2 ms              |

Latency: Node, M-series Mac, q8 weights, after warm-up, 30 single-query embeddings per model.

**Decision: keep bge-small.** It has the best MRR and the best fallback F1. gte-small ranks slightly better at Hit@3 (+0.025, two queries) but separates no-match queries much worse (F1 0.789, and it needs a 0.92 threshold); bge-base separates slightly better (AUC +0.011) but ranks clearly worse. Not tried: model2vec static models (no transformers.js pipeline support; see DECISIONS.md).

Per-model dev results: `eval/models/results/<model>/v2/`. Builds: `eval/models/<model>.config.ts` → `build-<model>/`.
