# Enrichment provider recordings

HTTP exchanges replayed by `test-support/replay.ts` so enrichment tests never call a real model (spec §10, §14). Each file has `source`: `"recorded"` (captured from a local server) or `"synthetic"` (written from the provider's API docs before a runtime was available). Synthetic files get replaced with recordings once Ollama or LM Studio runs locally.
