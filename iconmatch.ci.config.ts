// CI build (spec §10): the committed 200-icon fixture subset, no enrichment.
import { readFileSync } from "node:fs";
import {
  createTablerAdapter,
  defineConfig,
  subsetAdapter,
} from "@iconmatch/pipeline/config";

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/tabler-200/catalog.json", import.meta.url),
    "utf8",
  ),
) as { name: string }[];

export default defineConfig({
  sets: [
    subsetAdapter(
      createTablerAdapter({ includeBrands: true }),
      fixture.map((e) => e.name),
    ),
  ],
  buildDir: "build-ci",
  packageDir: "build-ci/package",
  enrich: { mode: "none" },
});
