// Model comparison (spec §15.3): the shipped Tabler data embedded with
// Xenova/all-MiniLM-L6-v2. Builds into build-minilm/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-minilm",
  packageDir: "../../build-minilm/package",
  enrich: { mode: "none" },
  embed: { model: "Xenova/all-MiniLM-L6-v2" },
});
