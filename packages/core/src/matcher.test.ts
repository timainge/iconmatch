import { describe, expect, it } from "vitest";
import { IconMatchCapabilityError } from "./errors.js";
import { buildKeywordIndex } from "./keyword-index.js";
import { keywordConfidence, queryTerms } from "./keyword.js";
import {
  compareMatches,
  createIconMatcher,
  resolveVariant,
} from "./matcher.js";
import type { CatalogEntry, IconMatch } from "./types.js";

function entry(name: string, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: `t:${name}`,
    set: "t",
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " "),
    tags: [],
    categories: [],
    variants: ["outline"],
    license: "MIT",
    ...extra,
  };
}

const catalog = [
  entry("dog", { tags: ["pet", "animal"] }),
  entry("dog-bowl", { tags: ["pet", "food"] }),
  entry("heart", { tags: ["love"], variants: ["outline", "filled"] }),
  entry("scissors", { tags: ["cut", "grooming"] }),
  entry("letter-d", { tags: ["dog"], glyph: "letter" }),
];
const keywordIndex = buildKeywordIndex(catalog);

describe("createIconMatcher (keyword-only)", () => {
  it("returns ranked IconMatch results for a raw query", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex });
    const results = await m.search("  Dogs! ");
    expect(results.map((r) => r.id)).toEqual(["t:dog", "t:dog-bowl"]);
    expect(results[0]).toMatchObject({
      id: "t:dog",
      name: "dog",
      label: "Dog",
      set: "t",
      variant: "outline",
      availableVariants: ["outline"],
      matchedOn: { keyword: true, vector: false },
      confidence: 1,
    });
  });

  it("excludes glyphs by default and includes them on request", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex });
    expect((await m.search("dog")).map((r) => r.id)).not.toContain(
      "t:letter-d",
    );
    const g = await createIconMatcher({
      catalog,
      keywordIndex,
      includeGlyphs: true,
    });
    expect((await g.search("dog")).map((r) => r.id)).toContain("t:letter-d");
  });

  it("respects limit (default 10)", async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      entry(`pet-${String(i)}`, { tags: ["pet"] }),
    );
    const m = await createIconMatcher({
      catalog: many,
      keywordIndex: buildKeywordIndex(many),
    });
    expect(await m.search("pet")).toHaveLength(10);
    expect(await m.search("pet", { limit: 3 })).toHaveLength(3);
  });

  it("resolves the requested variant, falling back to the default", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex });
    expect((await m.search("heart", { variant: "filled" }))[0]?.variant).toBe(
      "filled",
    );
    expect((await m.search("dog", { variant: "filled" }))[0]?.variant).toBe(
      "outline",
    );
  });

  it("gives partial matches lower confidence than full matches", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex });
    const [top] = await m.search("dog grooming");
    expect(top?.confidence).toBeGreaterThan(0);
    expect(top?.confidence).toBeLessThanOrEqual(0.5);
    expect(await m.search("the and of")).toEqual([]);
  });

  it("get() returns catalog entries by id", async () => {
    const m = await createIconMatcher({ catalog });
    expect(m.get("t:heart")?.label).toBe("Heart");
    expect(m.get("t:nope")).toBeUndefined();
  });

  it("search() without a keyword index throws IconMatchCapabilityError naming the part", async () => {
    const m = await createIconMatcher({ catalog });
    const err = await m.search("dog").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IconMatchCapabilityError);
    expect(err).toMatchObject({ method: "search", part: "keywordIndex" });
    expect((err as Error).message).toContain('"keywordIndex"');
  });
});

describe("ranking helpers", () => {
  const match = (
    name: string,
    score: number,
    variants: IconMatch["availableVariants"] = ["outline"],
  ) =>
    ({
      id: `t:${name}`,
      name,
      score,
      availableVariants: variants,
    }) as IconMatch;

  it("tie-breaks by requested variant, then shorter name, then id", () => {
    const sorted = [
      match("heart-broken", 1),
      match("heart", 1),
      match("hearts", 1, ["outline", "filled"]),
      match("zzz", 2),
    ].sort(compareMatches("filled"));
    expect(sorted.map((m) => m.name)).toEqual([
      "zzz",
      "hearts",
      "heart",
      "heart-broken",
    ]);
  });

  it("resolveVariant prefers the request, else the first variant", () => {
    const e = entry("x", { variants: ["filled", "outline"] });
    expect(resolveVariant(e, "outline")).toBe("outline");
    expect(resolveVariant(e, "thin")).toBe("filled");
    expect(resolveVariant(e)).toBe("filled");
  });

  it("keywordConfidence weighs exact over prefix/fuzzy and scales by score", () => {
    expect(queryTerms("the dogs grooming")).toEqual(["dog", "grooming"]);
    expect(
      keywordConfidence(
        { score: 10, terms: ["dog"], queryTerms: ["dog"] },
        10,
        1,
      ),
    ).toBe(1);
    expect(
      keywordConfidence(
        { score: 10, terms: ["doggo"], queryTerms: ["dog"] },
        10,
        1,
      ),
    ).toBe(0.5);
    expect(
      keywordConfidence(
        { score: 5, terms: ["dog"], queryTerms: ["dog"] },
        10,
        2,
      ),
    ).toBe(0.25);
    expect(
      keywordConfidence({ score: 5, terms: [], queryTerms: [] }, 10, 0),
    ).toBe(0);
  });
});
