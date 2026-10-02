// Model comparison (spec §15.3): the shipped Tabler data embedded with
// Snowflake/snowflake-arctic-embed-xs. Builds into build-arctic-xs/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-arctic-xs",
  packageDir: "../../build-arctic-xs/package",
  enrich: { mode: "none" },
  embed: { model: "Snowflake/snowflake-arctic-embed-xs" },
});
