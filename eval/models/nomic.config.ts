// Model comparison (spec §15.3): the shipped Tabler data embedded with
// nomic-ai/nomic-embed-text-v1.5. Builds into build-nomic/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-nomic",
  packageDir: "../../build-nomic/package",
  enrich: { mode: "none" },
  embed: { model: "nomic-ai/nomic-embed-text-v1.5" },
});
