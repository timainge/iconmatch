// Model comparison (spec §15.3): the shipped Tabler data embedded with
// Xenova/gte-small. Builds into build-gte-small/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-gte-small",
  packageDir: "../../build-gte-small/package",
  enrich: { mode: "none" },
  embed: { model: "Xenova/gte-small" },
});
