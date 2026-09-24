import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogEntry, SvgArtifact } from "iconmatch";
import type { IconSetAdapter, RawIcon } from "./adapters/types.js";
import { rawIconProblems } from "./adapters/types.js";

export interface IngestResult {
  catalog: CatalogEntry[];
  svgs: SvgArtifact;
  /** Per-set metadata for the manifest (spec §6.6, §8). */
  sets?: SetInfo[];
}

export interface SetInfo {
  id: string;
  version: string;
  license: string;
  attributionRequired: boolean;
  url: string;
  count: number;
  /** Licence text to ship in `data/licenses/<id>.txt` (spec §8). */
  licenseText?: string;
}

/** Per-set metadata written next to the catalog, read by the `package` stage. */
export const SETS_FILE = "sets.json";

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
  const sets: SetInfo[] = [];

  for (const adapter of adapters) {
    const icons = await adapter.load();
    const before = catalog.length;
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
    const set: SetInfo = {
      id: adapter.id,
      version: adapter.version ?? "unknown",
      license: adapter.license.spdx,
      attributionRequired: adapter.license.attributionRequired,
      url: adapter.license.url,
      count: catalog.length - before,
    };
    const text = await adapter.licenseText?.();
    if (text !== undefined) set.licenseText = text;
    sets.push(set);
  }
  if (problems.length > 0) {
    throw new Error(
      `ingest found ${String(problems.length)} problem(s):\n${problems.join("\n")}`,
    );
  }

  catalog.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sortedSvgs: SvgArtifact = {};
  for (const { id } of catalog) sortedSvgs[id] = svgs[id] ?? {};
  return { catalog, svgs: sortedSvgs, sets };
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
  if (result.sets) {
    const sets = result.sets.map((set) => {
      const copy = { ...set };
      delete copy.licenseText;
      return copy;
    });
    await writeFile(
      join(outDir, SETS_FILE),
      JSON.stringify(sets, null, 2) + "\n",
    );
    for (const s of result.sets) {
      if (s.licenseText === undefined) continue;
      await mkdir(join(outDir, "licenses"), { recursive: true });
      await writeFile(join(outDir, "licenses", `${s.id}.txt`), s.licenseText);
    }
  }
  return paths;
}
