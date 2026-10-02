// Model comparison (post-v1, owner-directed): same data as the shipped build,
// embedded with Xenova/bge-large-en-v1.5. Builds into build-bge-large/ and never
// touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-bge-large",
  packageDir: "../../build-bge-large/package",
  enrich: { mode: "none" },
  embed: { model: "Xenova/bge-large-en-v1.5" },
});
