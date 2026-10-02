// Enrichment v3, variant 1 (spec §15.5): text-v2 concepts in the keyword
// index only, not in the embedded text. Reuses the enrichment cache, so no
// LLM calls for icons already enriched. Builds into build-text-index/.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-text-index",
  packageDir: "../../build-text-index/package",
  enrich: {
    mode: "text",
    applyTo: "index",
    cacheFile: "../../packages/pipeline/cache/enrichment.jsonl",
  },
});
