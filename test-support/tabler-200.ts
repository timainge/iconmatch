import { fsSource } from "../packages/core/src/data/fs.node.js";
import {
  loadCatalog,
  loadKeywordIndex,
  loadSvgs,
} from "../packages/core/src/data/loaders.js";
import { fixturePath } from "./fixtures.js";

/** DataSource over the committed 200-icon fixture (spec §10). */
export const tabler200 = () => fsSource(fixturePath("tabler-200"));

/** Loads every fixture artifact. */
export async function loadTabler200() {
  const src = tabler200();
  const [catalog, keywordIndex, svgs] = await Promise.all([
    loadCatalog(src),
    loadKeywordIndex(src),
    loadSvgs(src),
  ]);
  return { catalog, keywordIndex, svgs };
}
