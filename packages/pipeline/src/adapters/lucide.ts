import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { IconifySet } from "./tabler.js";
import type { IconSetAdapter, RawIcon } from "./types.js";
import { normaliseTags } from "./types.js";

/** Inputs of the Lucide adapter (spec §15.2). */
export interface LucideSource {
  /** `@iconify-json/lucide` icons.json: SVG bodies (aliases live elsewhere and are ignored). */
  iconify: IconifySet;
  /** `lucide-static` tags.json: Lucide's own tags, keyed by icon name. */
  tags: Record<string, string[]>;
  /** Tabler's Iconify set, the source of the fallback letter strokes. */
  tablerIconify: IconifySet;
  /** Lucide release the tags come from (`lucide-static`). */
  version: string;
}

export interface LucideStats {
  concepts: number;
  zeroTags: number;
  skippedHidden: number;
  glyphs: number;
}

/** Stroke attributes shared by Lucide and Tabler outline icons. */
const STROKE =
  'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';

/** Lucide's own frames, verbatim geometry from its `square` and `circle` icons. */
const FRAMES = {
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
} as const;

/** Tabler's square frame path, identical in geometry to Lucide's `square`. */
const TABLER_SQUARE_FRAME =
  "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";

const CHARS = [
  ..."abcdefghijklmnopqrstuvwxyz"
    .split("")
    .map((c) => ({ c, kind: "letter" as const })),
  ..."0123456789".split("").map((c) => ({ c, kind: "number" as const })),
];

/**
 * The letter strokes of a Tabler `square-<letter|number>-<c>` glyph: every
 * `<path>` after the frame. Tabler draws on the same 24px grid with the same
 * 2px round stroke as Lucide, and its square frame matches Lucide's.
 */
export function tablerLetterPaths(
  tablerIconify: IconifySet,
  kind: "letter" | "number",
  c: string,
): string {
  const name = `square-${kind}-${c}`;
  const body = tablerIconify.icons[name]?.body;
  if (!body) throw new Error(`Tabler glyph ${name} not found`);
  const ds = [...body.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1] ?? "");
  if (!ds[0]?.startsWith(TABLER_SQUARE_FRAME))
    throw new Error(`Tabler glyph ${name} has an unexpected shape: ${body}`);
  const letter: string[] = [];
  for (const d of ds) {
    if (!d.startsWith(TABLER_SQUARE_FRAME)) {
      letter.push(d);
      continue;
    }
    // Iconify may merge the letter into the frame's path: "<frame>z m7 11…".
    // After "z" the current point is the frame's start (3,5), so a relative
    // moveto becomes absolute by adding it.
    const rest = d.slice(TABLER_SQUARE_FRAME.length).trim();
    if (rest === "") continue;
    const move = /^([mM])\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/.exec(rest);
    if (!move)
      throw new Error(`Tabler glyph ${name} has an unexpected shape: ${body}`);
    const [all, cmd, x, y] = move;
    const abs =
      cmd === "m"
        ? `M${String(3 + Number(x))} ${String(5 + Number(y))}`
        : `M${x ?? ""} ${y ?? ""}`;
    letter.push(abs + rest.slice(all.length));
  }
  if (letter.length === 0)
    throw new Error(`Tabler glyph ${name} has an unexpected shape: ${body}`);
  return letter.map((d) => `<path d="${d}"/>`).join("");
}

/**
 * Lettered fallback glyphs in Lucide style (spec §15.2): Lucide's square or
 * circle frame around Tabler's letter strokes, named like Tabler's so the
 * core fallback (`<set>:square-letter-<c>`) works unchanged.
 */
export function lucideGlyphs(tablerIconify: IconifySet): RawIcon[] {
  const out: RawIcon[] = [];
  for (const shape of ["square", "circle"] as const)
    for (const { c, kind } of CHARS) {
      const strokes = tablerLetterPaths(tablerIconify, kind, c);
      out.push({
        name: `${shape}-${kind}-${c}`,
        variants: {
          outline: {
            body: `<g ${STROKE}>${FRAMES[shape]}${strokes}</g>`,
            width: 24,
            height: 24,
          },
        },
        tags: [`${kind} ${c}`],
        categories: ["text"],
        glyph: kind,
      });
    }
  return out;
}

/** Pure transform from the Lucide sources to RawIcons. */
export function lucideIcons(source: LucideSource): {
  icons: RawIcon[];
  stats: LucideStats;
} {
  const stats: LucideStats = {
    concepts: 0,
    zeroTags: 0,
    skippedHidden: 0,
    glyphs: 0,
  };
  const icons: RawIcon[] = [];
  const glyphs = lucideGlyphs(source.tablerIconify);
  const glyphNames = new Set(glyphs.map((g) => g.name));
  const { iconify } = source;
  for (const [name, icon] of Object.entries(iconify.icons).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    // Hidden icons are Lucide's renamed/removed ones, kept by Iconify for
    // backwards compatibility (spec §6.1 rule 3: skip deprecated).
    if (icon.hidden) {
      stats.skippedHidden++;
      continue;
    }
    if (glyphNames.has(name))
      throw new Error(`Lucide now has its own ${name}; revisit the glyphs`);
    const tags = normaliseTags(source.tags[name] ?? []);
    icons.push({
      name,
      variants: {
        outline: {
          body: icon.body,
          width: icon.width ?? iconify.width ?? 24,
          height: icon.height ?? iconify.height ?? 24,
        },
      },
      tags,
      categories: [],
    });
    if (tags.length === 0) stats.zeroTags++;
    stats.concepts++;
  }
  for (const g of glyphs) {
    icons.push(g);
    stats.glyphs++;
    stats.concepts++;
  }
  icons.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { icons, stats };
}

const require = createRequire(import.meta.url);

function packageFile(pkg: string, file: string): string {
  for (const dir of require.resolve.paths(pkg) ?? []) {
    const candidate = join(dir, pkg, file);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot find ${file} in installed package ${pkg}`);
}

const readJson = async <T>(pkg: string, file: string): Promise<T> =>
  JSON.parse(await readFile(packageFile(pkg, file), "utf8")) as T;

/** Reads the installed `@iconify-json/lucide`, `lucide-static` and `@iconify-json/tabler`. */
export async function readLucideSource(): Promise<LucideSource> {
  const [iconify, tags, tablerIconify, pkg] = await Promise.all([
    readJson<IconifySet>("@iconify-json/lucide", "icons.json"),
    readJson<Record<string, string[]>>("lucide-static", "tags.json"),
    readJson<IconifySet>("@iconify-json/tabler", "icons.json"),
    readJson<{ version: string }>("lucide-static", "package.json"),
  ]);
  return { iconify, tags, tablerIconify, version: pkg.version };
}

/** Licence text shipped with the data: Lucide's ISC licence plus the Tabler notice for the letter strokes. */
export async function lucideLicenseText(): Promise<string> {
  const [lucide, tabler] = await Promise.all([
    readFile(packageFile("lucide-static", "LICENSE"), "utf8"),
    readFile(packageFile("@tabler/icons", "LICENSE"), "utf8"),
  ]);
  return `${lucide.trimEnd()}

---

The lettered fallback glyphs (square-letter-*, square-number-*, circle-letter-*,
circle-number-*) combine Lucide's square and circle frames with letter strokes
from Tabler Icons, used under the MIT licence:

${tabler.trimEnd()}
`;
}

export interface LucideAdapter extends IconSetAdapter {
  stats?: LucideStats;
}

export function createLucideAdapter(
  options: {
    source?: () => Promise<LucideSource>;
    log?: (message: string) => void;
  } = {},
): LucideAdapter {
  const adapter: LucideAdapter = {
    id: "lucide",
    license: {
      spdx: "ISC",
      url: "https://github.com/lucide-icons/lucide/blob/main/LICENSE",
      attributionRequired: false,
    },
    variants: ["outline"],
    fallbackIcon: "shapes",
    licenseText: lucideLicenseText,
    async load() {
      const source = await (options.source ?? readLucideSource)();
      const { icons, stats } = lucideIcons(source);
      adapter.version = source.version;
      adapter.stats = stats;
      (options.log ?? console.log)(
        `lucide: ${String(stats.concepts)} concepts (${String(stats.glyphs)} fallback glyphs), ${String(stats.zeroTags)} with zero tags, ${String(stats.skippedHidden)} hidden skipped`,
      );
      return icons;
    },
  };
  return adapter;
}
