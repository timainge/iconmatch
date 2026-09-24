import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { IconSetAdapter, RawIcon, VariantName } from "./types.js";
import { normaliseTags } from "./types.js";

/** Subset of an Iconify JSON icon set that the adapter reads. */
export interface IconifySet {
  width?: number;
  height?: number;
  icons: Record<
    string,
    { body: string; width?: number; height?: number; hidden?: boolean }
  >;
}

/** One entry of `@tabler/icons/icons.json` (the authoritative tag source). */
export interface TablerMeta {
  name: string;
  category?: string;
  /** Mostly strings; the package also contains numbers and nulls. */
  tags?: unknown[];
}

export interface TablerSource {
  iconify: IconifySet;
  meta: Record<string, TablerMeta>;
  version: string;
}

export interface TablerOptions {
  /** Include `brand-*` icons, flagged `brand: true` (spec §6.1 rule 3). */
  includeBrands?: boolean;
  /** Fold `<name>-filled` into a `filled` variant. Off in v1. */
  includeFilled?: boolean;
}

export interface TablerStats {
  concepts: number;
  brands: number;
  zeroTags: number;
  droppedFilled: number;
  skippedHidden: number;
  skippedBrands: number;
  glyphs: number;
}

const FILLED = "-filled";
const GLYPH_FRAMES = [
  "circle",
  "circle-dashed",
  "circle-dotted",
  "hexagon",
  "pentagon",
  "rosette",
  "square",
  "square-rounded",
];
const GLYPH = new RegExp(
  `^(?:(?:${GLYPH_FRAMES.join("|")})-)?(letter-[a-z]|number-[0-9])(?:-small)?$`,
);

/** "letter" / "number" for single-character glyph icons (spec §7.4). */
export function glyphKind(name: string): "letter" | "number" | undefined {
  const m = GLYPH.exec(name);
  if (!m?.[1]) return undefined;
  return m[1].startsWith("letter-") ? "letter" : "number";
}

/**
 * Pure transform from the two Tabler sources to RawIcons. SVGs come from
 * Iconify; tags and category come from Tabler's own `icons.json`.
 */
export function tablerIcons(
  source: TablerSource,
  options: TablerOptions = {},
): { icons: RawIcon[]; stats: TablerStats } {
  const includeBrands = options.includeBrands ?? true;
  const includeFilled = options.includeFilled ?? false;
  const { iconify, meta } = source;
  const stats: TablerStats = {
    concepts: 0,
    brands: 0,
    zeroTags: 0,
    droppedFilled: 0,
    skippedHidden: 0,
    skippedBrands: 0,
    glyphs: 0,
  };
  const icons: RawIcon[] = [];

  for (const [name, icon] of Object.entries(iconify.icons).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (name.endsWith(FILLED)) {
      stats.droppedFilled++;
      continue;
    }
    if (icon.hidden) {
      stats.skippedHidden++;
      continue;
    }
    const brand = name.startsWith("brand-");
    if (brand && !includeBrands) {
      stats.skippedBrands++;
      continue;
    }
    const size = (i: { width?: number; height?: number }) => ({
      width: i.width ?? iconify.width ?? 16,
      height: i.height ?? iconify.height ?? 16,
    });
    const variants: RawIcon["variants"] = {
      outline: { body: icon.body, ...size(icon) },
    };
    const filled = iconify.icons[name + FILLED];
    if (includeFilled && filled && !filled.hidden) {
      variants.filled = { body: filled.body, ...size(filled) };
    }

    const m = meta[name];
    const rawTags = (m?.tags ?? []).flatMap((t) =>
      typeof t === "string" || typeof t === "number" ? [String(t)] : [],
    );
    const categories = normaliseTags(m?.category ? [m.category] : []);
    const brandName = name.slice("brand-".length).replace(/-/g, " ");
    const tags = normaliseTags(brand ? [...rawTags, brandName] : rawTags);
    if (brand && !categories.includes("brand")) categories.push("brand");

    const raw: RawIcon = { name, variants, tags, categories };
    if (brand) {
      raw.brand = true;
      stats.brands++;
    }
    const glyph = glyphKind(name);
    if (glyph) {
      raw.glyph = glyph;
      stats.glyphs++;
    }
    if (tags.length === 0) stats.zeroTags++;
    stats.concepts++;
    icons.push(raw);
  }
  return { icons, stats };
}

const require = createRequire(import.meta.url);

/**
 * Locates a file inside an installed package by walking the resolver's
 * node_modules paths. Needed because `@tabler/icons` has an `exports` map
 * that hides its root `icons.json`.
 */
function packageFile(pkg: string, file: string): string {
  for (const dir of require.resolve.paths(pkg) ?? []) {
    const candidate = join(dir, pkg, file);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot find ${file} in installed package ${pkg}`);
}

/** Reads the installed `@iconify-json/tabler` and `@tabler/icons` packages. */
export async function readTablerSource(): Promise<TablerSource> {
  const json = async <T>(specifier: string): Promise<T> => {
    const [scope = "", name = "", ...rest] = specifier.split("/");
    const path = packageFile(`${scope}/${name}`, rest.join("/"));
    return JSON.parse(await readFile(path, "utf8")) as T;
  };
  const [iconify, meta, info] = await Promise.all([
    json<IconifySet>("@iconify-json/tabler/icons.json"),
    json<Record<string, TablerMeta>>("@tabler/icons/icons.json"),
    json<{ version: string }>("@iconify-json/tabler/info.json"),
  ]);
  return { iconify, meta, version: info.version };
}

export interface TablerAdapter extends IconSetAdapter {
  /** Counts from the most recent `load()`. */
  stats?: TablerStats;
}

export function createTablerAdapter(
  options: TablerOptions & {
    source?: () => Promise<TablerSource>;
    log?: (message: string) => void;
  } = {},
): TablerAdapter {
  const variants: VariantName[] = options.includeFilled
    ? ["outline", "filled"]
    : ["outline"];
  const adapter: TablerAdapter = {
    id: "tabler",
    license: {
      spdx: "MIT",
      url: "https://github.com/tabler/tabler-icons/blob/master/LICENSE",
      attributionRequired: false,
    },
    variants,
    licenseText: () =>
      readFile(packageFile("@tabler/icons", "LICENSE"), "utf8"),
    async load() {
      const source = await (options.source ?? readTablerSource)();
      const { icons, stats } = tablerIcons(source, options);
      adapter.stats = stats;
      adapter.version = source.version;
      (options.log ?? console.log)(
        `tabler ${source.version}: ${String(stats.concepts)} concepts, ` +
          `${String(stats.brands)} brands, ${String(stats.zeroTags)} with zero tags, ` +
          `${String(stats.droppedFilled)} -filled dropped, ` +
          `${String(stats.skippedHidden)} hidden skipped, ${String(stats.glyphs)} glyphs`,
      );
      return icons;
    },
  };
  return adapter;
}
