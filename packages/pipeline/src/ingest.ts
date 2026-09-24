import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogEntry, SvgArtifact } from "iconmatch";
import type { IconSetAdapter, RawIcon } from "./adapters/types.js";
import { rawIconProblems } from "./adapters/types.js";

export interface IngestResult {
  catalog: CatalogEntry[];
  svgs: SvgArtifact;
}

/** "arrow-bar-to-down" -> "Arrow bar to down". Brands drop the prefix. */
export function humanise(name: string, brand = false): string {
  const words = (brand ? name.replace(/^brand-/, "") : name).split("-");
  const text = words.filter(Boolean).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toEntry(adapter: IconSetAdapter, icon: RawIcon): CatalogEntry {
  const entry: CatalogEntry = {
    id: `${adapter.id}:${icon.name}`,
    set: adapter.id,
    name: icon.name,
    label: humanise(icon.name, icon.brand),
    tags: icon.tags,
    categories: icon.categories,
    // In the adapter's preference order, so variants[0] is the default.
    variants: adapter.variants.filter((v) => icon.variants[v] !== undefined),
    license: adapter.license.spdx,
  };
  if (icon.brand) entry.brand = true;
  if (icon.glyph) entry.glyph = icon.glyph;
  return entry;
}

/**
 * Loads every adapter and builds the catalog and SVG artifact (spec §6.2).
 * Deprecated icons are skipped; any icon breaking the RawIcon invariants or
 * a duplicate id fails the whole ingest, listing every problem.
 */
export async function ingest(
  adapters: IconSetAdapter[],
): Promise<IngestResult> {
  const catalog: CatalogEntry[] = [];
  const svgs: SvgArtifact = {};
  const problems: string[] = [];

  for (const adapter of adapters) {
    const icons = await adapter.load();
    for (const icon of icons) {
      if (icon.deprecated) continue;
      const entry = toEntry(adapter, icon);
      for (const p of rawIconProblems(icon, adapter)) {
        problems.push(`${entry.id}: ${p}`);
      }
      if (entry.id in svgs) {
        problems.push(`${entry.id}: duplicate id`);
        continue;
      }
      catalog.push(entry);
      svgs[entry.id] = Object.fromEntries(
        entry.variants.map((v) => [v, icon.variants[v]]),
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `ingest found ${String(problems.length)} problem(s):\n${problems.join("\n")}`,
    );
  }

  catalog.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sortedSvgs: SvgArtifact = {};
  for (const { id } of catalog) sortedSvgs[id] = svgs[id] ?? {};
  return { catalog, svgs: sortedSvgs };
}

/** Writes `catalog.json` and `svgs.json` to `outDir`. Byte-stable for equal input. */
export async function writeIngest(
  result: IngestResult,
  outDir: string,
): Promise<{ catalog: string; svgs: string }> {
  await mkdir(outDir, { recursive: true });
  const paths = {
    catalog: join(outDir, "catalog.json"),
    svgs: join(outDir, "svgs.json"),
  };
  await writeFile(paths.catalog, JSON.stringify(result.catalog) + "\n");
  await writeFile(paths.svgs, JSON.stringify(result.svgs) + "\n");
  return paths;
}
