import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildKeywordIndex,
  type CatalogEntry,
  type KeywordEnrichment,
} from "@iconmatch/core";

/** Serialises the keyword index for a catalog (spec §6.5). */
export function keywordIndexJson(
  catalog: CatalogEntry[],
  enrichments?: ReadonlyMap<string, KeywordEnrichment>,
): string {
  return JSON.stringify(buildKeywordIndex(catalog, enrichments)) + "\n";
}

/** `index` stage: reads `catalog.json` from `buildDir`, writes `keyword-index.json`. */
export async function runIndex(
  buildDir: string,
  enrichments?: ReadonlyMap<string, KeywordEnrichment>,
): Promise<string> {
  const catalog = JSON.parse(
    await readFile(join(buildDir, "catalog.json"), "utf8"),
  ) as CatalogEntry[];
  const out = join(buildDir, "keyword-index.json");
  await writeFile(out, keywordIndexJson(catalog, enrichments));
  return out;
}
