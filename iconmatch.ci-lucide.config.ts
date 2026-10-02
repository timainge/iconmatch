// CI build of a Lucide subset (spec §15.2): the names in fixtures/lucide-subset.json.
import { readFileSync } from "node:fs";
import {
  createLucideAdapter,
  defineConfig,
  subsetAdapter,
} from "@iconmatch/pipeline/config";

const names = JSON.parse(
  readFileSync(
    new URL("./fixtures/lucide-subset.json", import.meta.url),
    "utf8",
  ),
) as string[];

export default defineConfig({
  sets: [subsetAdapter(createLucideAdapter(), names)],
  buildDir: "build-ci-lucide",
  packageDir: "build-ci-lucide/package",
  enrich: { mode: "none" },
});
