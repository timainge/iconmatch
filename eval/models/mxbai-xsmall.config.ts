// Model comparison (spec §15.3): the shipped Tabler data embedded with
// mixedbread-ai/mxbai-embed-xsmall-v1. Builds into build-mxbai-xsmall/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-mxbai-xsmall",
  packageDir: "../../build-mxbai-xsmall/package",
  enrich: { mode: "none" },
  embed: { model: "mixedbread-ai/mxbai-embed-xsmall-v1" },
});
