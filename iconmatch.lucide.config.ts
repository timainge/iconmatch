// Lucide data for @iconmatch/lucide (spec §15.2). Run:
//   npx iconmatch-build all --config iconmatch.lucide.config.ts
import { createLucideAdapter, defineConfig } from "@iconmatch/pipeline/config";

export default defineConfig({
  sets: [createLucideAdapter()],
  buildDir: "build-lucide",
  packageDir: "packages/lucide/data",
  enrich: { mode: "none" },
});
