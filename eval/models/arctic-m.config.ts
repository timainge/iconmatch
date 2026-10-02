// Model comparison (spec §15.3): the shipped Tabler data embedded with
// Snowflake/snowflake-arctic-embed-m-v1.5. Builds into build-arctic-m/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-arctic-m",
  packageDir: "../../build-arctic-m/package",
  enrich: { mode: "none" },
  embed: { model: "Snowflake/snowflake-arctic-embed-m-v1.5" },
});
