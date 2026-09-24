import { beforeAll, describe, expect, it } from "vitest";
import {
  createTablerAdapter,
  glyphKind,
  readTablerSource,
  tablerIcons,
  type TablerSource,
  type TablerStats,
} from "./tabler.js";
import { rawIconProblems, type RawIcon } from "./types.js";

const body = (d: string) => `<path d="${d}"/>`;

const source: TablerSource = {
  version: "0.0.0-test",
  iconify: {
    width: 24,
    height: 24,
    icons: {
      heart: { body: body("h") },
      "heart-filled": { body: body("hf") },
      "circle-0-filled": { body: body("c0f") },
      "brand-netflix": { body: body("n") },
      "brand-google-drive": { body: body("g") },
      barell: { body: body("b"), hidden: true },
      "square-letter-a": { body: body("sa") },
      "number-7-small": { body: body("n7") },
      "letter-case": { body: body("lc") },
      "scan-letter-a": { body: body("scan") },
      wide: { body: body("w"), width: 32 },
      untagged: { body: body("u") },
    },
  },
  meta: {
    heart: {
      name: "heart",
      category: "Shapes",
      tags: ["Love", "love", "like"],
    },
    "brand-netflix": { name: "brand-netflix", category: "Brand", tags: ["tv"] },
    "brand-google-drive": { name: "brand-google-drive", tags: ["files"] },
    "square-letter-a": {
      name: "square-letter-a",
      category: "Letters",
      tags: [],
    },
    "number-7-small": {
      name: "number-7-small",
      category: "Numbers",
      tags: [7, null],
    },
  },
};

function byName(icons: RawIcon[], name: string): RawIcon | undefined {
  return icons.find((i) => i.name === name);
}

describe("tablerIcons", () => {
  const { icons, stats } = tablerIcons(source);

  it("drops -filled icons and never emits them as concepts", () => {
    expect(
      icons.map((i) => i.name).filter((n) => n.endsWith("-filled")),
    ).toEqual([]);
    expect(byName(icons, "heart")?.variants).toEqual({
      outline: { body: body("h"), width: 24, height: 24 },
    });
    expect(stats.droppedFilled).toBe(2);
  });

  it("folds -filled into a filled variant only when includeFilled is set", () => {
    const heart = byName(
      tablerIcons(source, { includeFilled: true }).icons,
      "heart",
    );
    expect(heart?.variants.filled?.body).toBe(body("hf"));
  });

  it("skips hidden (deprecated) icons", () => {
    expect(byName(icons, "barell")).toBeUndefined();
    expect(stats.skippedHidden).toBe(1);
  });

  it("includes brands by default, flagged, with category and brand-name tag", () => {
    expect(byName(icons, "brand-netflix")).toMatchObject({
      brand: true,
      categories: ["brand"],
      tags: ["tv", "netflix"],
    });
    expect(byName(icons, "brand-google-drive")).toMatchObject({
      brand: true,
      categories: ["brand"],
      tags: ["files", "google drive"],
    });
    expect(byName(icons, "heart")?.brand).toBeUndefined();
    expect(stats.brands).toBe(2);
  });

  it("omits brands when includeBrands is false", () => {
    const r = tablerIcons(source, { includeBrands: false });
    expect(r.icons.some((i) => i.brand)).toBe(false);
    expect(r.stats.skippedBrands).toBe(2);
  });

  it("takes tags and category from Tabler metadata, lowercased and deduped", () => {
    expect(byName(icons, "heart")).toMatchObject({
      tags: ["love", "like"],
      categories: ["shapes"],
    });
    expect(byName(icons, "number-7-small")?.tags).toEqual(["7"]);
  });

  it("marks single-character letter/number glyphs", () => {
    expect(byName(icons, "square-letter-a")?.glyph).toBe("letter");
    expect(byName(icons, "number-7-small")?.glyph).toBe("number");
    expect(byName(icons, "letter-case")?.glyph).toBeUndefined();
    expect(byName(icons, "scan-letter-a")?.glyph).toBeUndefined();
    expect(stats.glyphs).toBe(2);
  });

  it("uses per-icon viewBox size over the set default", () => {
    expect(byName(icons, "wide")?.variants.outline).toMatchObject({
      width: 32,
      height: 24,
    });
  });

  it("counts concepts and zero-tag icons", () => {
    expect(stats).toMatchObject({ concepts: 9, zeroTags: 5 });
  });

  it("emits icons that satisfy the RawIcon invariants", () => {
    for (const icon of icons) {
      expect(rawIconProblems(icon, { variants: ["outline"] })).toEqual([]);
    }
  });
});

describe("glyphKind", () => {
  it.each([
    ["letter-a", "letter"],
    ["square-letter-z", "letter"],
    ["circle-dashed-letter-q", "letter"],
    ["square-number-0", "number"],
    ["hexagon-number-9", "number"],
    ["number-3-small", "number"],
    ["number-10", undefined],
    ["number-123", undefined],
    ["letter-spacing", undefined],
    ["list-letters", undefined],
  ])("%s -> %s", (name, kind) => {
    expect(glyphKind(name)).toBe(kind);
  });
});

describe("createTablerAdapter", () => {
  it("logs counts and exposes stats and version after load", async () => {
    const logs: string[] = [];
    const adapter = createTablerAdapter({
      source: () => Promise.resolve(source),
      log: (m) => logs.push(m),
    });
    expect(adapter).toMatchObject({ id: "tabler", variants: ["outline"] });
    expect(adapter.license.spdx).toBe("MIT");
    await adapter.load();
    expect(adapter.version).toBe("0.0.0-test");
    expect(adapter.stats?.concepts).toBe(9);
    expect(logs).toEqual([
      "tabler 0.0.0-test: 9 concepts, 2 brands, 5 with zero tags, " +
        "2 -filled dropped, 1 hidden skipped, 2 glyphs",
    ]);
  });
});

describe("Tabler adapter on the installed packages", () => {
  let icons: RawIcon[];
  let stats: TablerStats;
  let real: TablerSource;

  beforeAll(async () => {
    real = await readTablerSource();
    ({ icons, stats } = tablerIcons(real));
  });

  it("produces concept counts within the §11.1 sanity ranges", () => {
    expect(stats.concepts).toBeGreaterThanOrEqual(4500);
    expect(stats.concepts).toBeLessThanOrEqual(6500);
    // Spec range is 400–1,000; Tabler 3.48.0 has 376 brands (see DECISIONS.md).
    expect(stats.brands).toBeGreaterThanOrEqual(350);
    expect(stats.brands).toBeLessThanOrEqual(1000);
    expect(stats.droppedFilled).toBeGreaterThan(1000);
  });

  it("emits no -filled or hidden icons and every concept has metadata", () => {
    for (const icon of icons) {
      expect(icon.name.endsWith("-filled")).toBe(false);
      expect(real.iconify.icons[icon.name]?.hidden).toBeFalsy();
      expect(real.meta[icon.name]).toBeDefined();
      expect(rawIconProblems(icon, { variants: ["outline"] })).toEqual([]);
    }
  });

  it("has the square/circle letter and number glyphs the fallback needs", () => {
    const glyphs = new Map(icons.map((i) => [i.name, i.glyph]));
    for (const frame of ["square", "circle"]) {
      for (const c of "abcdefghijklmnopqrstuvwxyz") {
        expect(glyphs.get(`${frame}-letter-${c}`)).toBe("letter");
      }
      for (const d of "0123456789") {
        expect(glyphs.get(`${frame}-number-${d}`)).toBe("number");
      }
    }
    expect(glyphs.has("category")).toBe(true);
  });
});
