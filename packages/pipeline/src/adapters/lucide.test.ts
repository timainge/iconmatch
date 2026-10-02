import { letterFallback } from "@iconmatch/core";
import { beforeAll, describe, expect, it } from "vitest";
import { ingest } from "../ingest.js";
import {
  createLucideAdapter,
  lucideIcons,
  lucideLicenseText,
  readLucideSource,
  tablerLetterPaths,
  type LucideSource,
  type LucideStats,
} from "./lucide.js";
import { rawIconProblems, type RawIcon } from "./types.js";

const g = (paths: string) =>
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${paths}</g>`;

/** A minimal Tabler Iconify set with every square letter/number glyph. */
const tablerIconify = {
  width: 24,
  height: 24,
  icons: Object.fromEntries(
    [
      ..."abcdefghijklmnopqrstuvwxyz".split("").map((c) => `letter-${c}`),
      ..."0123456789".split("").map((c) => `number-${c}`),
    ].map((n) => [
      `square-${n}`,
      {
        body: g(
          `<path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="L-${n}"/>`,
        ),
      },
    ]),
  ),
};

const source: LucideSource = {
  version: "0.0.0-test",
  iconify: {
    width: 24,
    height: 24,
    icons: {
      heart: { body: '<path d="h"/>' },
      "trash-2": { body: '<path d="t"/>' },
      "old-name": { body: '<path d="o"/>', hidden: true },
      untagged: { body: '<path d="u"/>' },
    },
  },
  tags: { heart: ["Love", "like", "love"], "trash-2": ["delete"] },
  tablerIconify,
};

const byName = (icons: RawIcon[], name: string) =>
  icons.find((i) => i.name === name);

describe("lucideIcons", () => {
  const { icons, stats } = lucideIcons(source);

  it("emits visible icons with Lucide's tags, and skips hidden (renamed/removed) ones", () => {
    expect(byName(icons, "heart")).toMatchObject({
      tags: ["love", "like"],
      categories: [],
      variants: { outline: { body: '<path d="h"/>', width: 24, height: 24 } },
    });
    expect(byName(icons, "old-name")).toBeUndefined();
    expect(stats.skippedHidden).toBe(1);
    expect(stats.zeroTags).toBe(1);
  });

  it("adds square and circle letter/number glyphs: Lucide's frame around Tabler's letter strokes", () => {
    expect(stats.glyphs).toBe(2 * 36);
    expect(byName(icons, "square-letter-m")).toMatchObject({
      glyph: "letter",
      variants: {
        outline: {
          body: g(
            '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="L-letter-m"/>',
          ),
        },
      },
    });
    expect(byName(icons, "circle-number-7")?.variants.outline?.body).toBe(
      g('<circle cx="12" cy="12" r="10"/><path d="L-number-7"/>'),
    );
  });

  it("satisfies the RawIcon invariants", () => {
    for (const icon of icons)
      expect(rawIconProblems(icon, { variants: ["outline"] })).toEqual([]);
    expect(stats.concepts).toBe(icons.length);
  });

  it("refuses to shadow a real Lucide icon with a generated glyph", () => {
    expect(() =>
      lucideIcons({
        ...source,
        iconify: {
          icons: { ...source.iconify.icons, "square-letter-a": { body: "x" } },
        },
      }),
    ).toThrow(/Lucide now has its own square-letter-a/);
  });

  it("splits a letter that Iconify merged into the frame's path, making its move absolute", () => {
    const frame =
      "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
    expect(
      tablerLetterPaths(
        {
          icons: {
            "square-letter-h": {
              body: `<path fill="none" d="${frame}m7 11V8m4 0v8m-4-4h4"/>`,
            },
          },
        },
        "letter",
        "h",
      ),
    ).toBe('<path d="M10 16V8m4 0v8m-4-4h4"/>');
  });

  it("fails clearly on an unexpected Tabler glyph shape", () => {
    expect(() =>
      tablerLetterPaths(
        { icons: { "square-letter-a": { body: '<path d="M0 0"/>' } } },
        "letter",
        "a",
      ),
    ).toThrow(/unexpected shape/);
  });
});

// Against the installed packages (spec §15.2 acceptance: counts, aliases
// skipped, licence, fallback glyphs a–z/0–9).
describe("Lucide adapter on the installed packages", () => {
  let real: LucideSource;
  let icons: RawIcon[];
  let stats: LucideStats;
  beforeAll(async () => {
    real = await readLucideSource();
    ({ icons, stats } = lucideIcons(real));
  });

  it("emits every visible icon once, never an alias, and tags nearly all of them", () => {
    const visible = Object.entries(real.iconify.icons).filter(
      ([, i]) => !i.hidden,
    );
    expect(stats.concepts - stats.glyphs).toBe(visible.length);
    expect(stats.concepts - stats.glyphs).toBeGreaterThan(1500);
    const aliases = Object.keys(
      (real.iconify as { aliases?: Record<string, unknown> }).aliases ?? {},
    );
    expect(aliases.length).toBeGreaterThan(0);
    const names = new Set(icons.map((i) => i.name));
    for (const a of aliases) expect(names.has(a), a).toBe(false);
    expect(stats.zeroTags).toBeLessThan(10);
  });

  it("resolves the lettered fallback to a real Lucide-style glyph for a–z and 0–9", async () => {
    const { catalog, sets } = await ingest([
      createLucideAdapter({ log: () => undefined }),
    ]);
    expect(sets?.[0]?.fallbackIcon).toBe("lucide:shapes");
    for (const c of "abcdefghijklmnopqrstuvwxyz0123456789") {
      const m = letterFallback(`${c}x`, catalog, {
        fallbackIcon: "lucide:shapes",
      });
      expect(m.id).toBe(
        /[a-z]/.test(c)
          ? `lucide:square-letter-${c}`
          : `lucide:square-number-${c}`,
      );
      expect(m.fallbackLetter).toBe(c);
    }
    expect(
      letterFallback("…", catalog, { fallbackIcon: "lucide:shapes" }).id,
    ).toBe("lucide:shapes");
  });

  it("ships Lucide's ISC licence with the Tabler MIT notice for the letter strokes", async () => {
    const text = await lucideLicenseText();
    expect(text).toMatch(/^ISC License/);
    expect(text).toContain("letter strokes");
    expect(text).toContain("Copyright (c) 2020-");
    expect(text).toContain("Paweł Kuna");
  });
});
