import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildKeywordIndex,
  type CatalogEntry,
  type SvgArtifact,
} from "@iconmatch/core";
import type { IngestResult } from "./ingest.js";

/** Size of the committed test fixture (spec §10). */
export const FIXTURE_SIZE = 200;

/** Concepts tests rely on: the §11.1 smoke set, brands, everyday categories. */
export const PINNED_NAMES = [
  "dog",
  "paw",
  "dog-bowl",
  "cat",
  "bone",
  "heart",
  "hearts",
  "pig-money",
  "cash",
  "coin",
  "currency-dollar",
  "moneybag",
  "report-money",
  "car",
  "car-garage",
  "car-suv",
  "car-crash",
  "bus",
  "bike",
  "calendar",
  "calendar-event",
  "shopping-cart",
  "basket",
  "home",
  "building-cottage",
  "tools",
  "hammer",
  "school",
  "backpack",
  "stethoscope",
  "first-aid-kit",
  "pill",
  "shield",
  "shield-check",
  "lock",
  "receipt",
  "receipt-tax",
  "file-invoice",
  "brand-netflix",
  "brand-spotify",
  "brand-github",
  "brand-google-drive",
  "plane",
  "beach",
  "ski-jumping",
  "snowflake",
  "mountain",
  "scissors",
  "bath",
  "book",
  "music",
  "camera",
  "gift",
  "baby-carriage",
  "briefcase",
  "category",
  "ball-football",
  "ball-basketball",
  "tent",
  "tree",
  "plant",
  "leaf",
  "coffee",
  "pizza",
  "apple",
  "bread",
  "glass-full",
  "chef-hat",
  "wash-machine",
  "bulb",
  "box",
  "truck-delivery",
  "phone",
  "mail",
  "users",
  "user",
  "settings",
  "trash",
];

/** Fallback glyphs (spec §7.4): square letters a–z and numbers 0–9. */
export const GLYPH_NAMES = [
  ..."abcdefghijklmnopqrstuvwxyz".split("").map((c) => `square-letter-${c}`),
  ..."0123456789".split("").map((d) => `square-number-${d}`),
];

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Deterministic subset: pinned concepts, the square glyphs, then non-glyph
 * icons in FNV-1a hash order until `size`. Throws if a pinned name is missing.
 */
export function selectFixture(
  result: IngestResult,
  set = "tabler",
  size = FIXTURE_SIZE,
): IngestResult {
  const byId = new Map(result.catalog.map((e) => [e.id, e]));
  const chosen = new Set<string>();
  for (const name of [...PINNED_NAMES, ...GLYPH_NAMES]) {
    const id = `${set}:${name}`;
    if (!byId.has(id))
      throw new Error(`Fixture icon ${id} is not in the catalog`);
    chosen.add(id);
  }
  const rest = result.catalog
    .filter((e) => !e.glyph && !chosen.has(e.id))
    .map((e) => e.id)
    .sort((a, b) => fnv1a(a) - fnv1a(b) || (a < b ? -1 : 1));
  for (const id of rest) {
    if (chosen.size >= size) break;
    chosen.add(id);
  }
  const catalog: CatalogEntry[] = result.catalog.filter((e) =>
    chosen.has(e.id),
  );
  const svgs: SvgArtifact = {};
  for (const e of catalog) svgs[e.id] = result.svgs[e.id] ?? {};
  return { catalog, svgs };
}

/** File contents of the fixture directory, keyed by file name. */
export function fixtureFiles(fixture: IngestResult): Record<string, string> {
  return {
    "catalog.json": JSON.stringify(fixture.catalog, null, 1) + "\n",
    "svgs.json": JSON.stringify(fixture.svgs, null, 1) + "\n",
    "keyword-index.json":
      JSON.stringify(buildKeywordIndex(fixture.catalog)) + "\n",
  };
}

export async function writeFixture(
  fixture: IngestResult,
  dir: string,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [name, text] of Object.entries(fixtureFiles(fixture))) {
    await writeFile(join(dir, name), text);
  }
}
