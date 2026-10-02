// Model comparison (spec §15.3): the shipped Tabler data embedded with
// Xenova/gte-base. Builds into build-gte-base/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-gte-base",
  packageDir: "../../build-gte-base/package",
  enrich: { mode: "none" },
  embed: { model: "Xenova/gte-base" },
});
