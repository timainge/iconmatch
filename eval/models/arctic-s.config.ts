// Model comparison (spec §15.3): the shipped Tabler data embedded with
// Snowflake/snowflake-arctic-embed-s. Builds into build-arctic-s/ and never touches packages/core/data.
import { createTablerAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createTablerAdapter({ includeBrands: true })],
  buildDir: "../../build-arctic-s",
  packageDir: "../../build-arctic-s/package",
  enrich: { mode: "none" },
  embed: { model: "Snowflake/snowflake-arctic-embed-s" },
});
