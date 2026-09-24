import { describe, expect, it } from "vitest";
import { buildKeywordIndex } from "./keyword-index.js";
import { fallbackCharacter, glyphId, letterFallback } from "./fallback.js";
import {
  createIconMatcher,
  DEFAULT_KEYWORD_MIN_CONFIDENCE,
  DEFAULT_MIN_CONFIDENCE,
} from "./matcher.js";
import type { CatalogEntry } from "./types.js";

function entry(name: string, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: `tabler:${name}`,
    set: "tabler",
    name,
    label: name,
    tags: [],
    categories: [],
    variants: ["outline"],
    license: "MIT",
    ...extra,
  };
}

const catalog = [
  entry("category"),
  entry("square-letter-m", { glyph: "letter" }),
  entry("square-letter-e", { glyph: "letter" }),
  entry("square-number-2", { glyph: "number" }),
  entry("circle-letter-m", { glyph: "letter" }),
  entry("heart", { tags: ["love"], variants: ["outline", "filled"] }),
];

describe("fallbackCharacter", () => {
  it.each([
    ["Misc", "m"],
    ["2024 taxes", "2"],
    ["  (Écoles)", "e"],
    ["Ärzte", "a"],
    ["ﬁnance", "f"],
    ["日本", "日"],
    ["!!!", undefined],
    ["", undefined],
  ])("%j -> %j", (label, char) => {
    expect(fallbackCharacter(label)).toBe(char);
  });
});

describe("glyphId", () => {
  it("maps a-z and 0-9 to framed glyph ids", () => {
    expect(glyphId("tabler", "m", "square")).toBe("tabler:square-letter-m");
    expect(glyphId("tabler", "7", "circle")).toBe("tabler:circle-number-7");
    expect(glyphId("tabler", "日", "square")).toBeUndefined();
  });
});

describe("letterFallback", () => {
  it("returns the square letter glyph with isFallback and fallbackLetter", () => {
    expect(letterFallback("Misc", catalog)).toEqual({
      id: "tabler:square-letter-m",
      name: "square-letter-m",
      label: "square-letter-m",
      set: "tabler",
      score: 0,
      confidence: 0,
      variant: "outline",
      availableVariants: ["outline"],
      matchedOn: { keyword: false, vector: false },
      isFallback: true,
      fallbackLetter: "m",
    });
  });

  it("maps digits and diacritics", () => {
    expect(letterFallback("2024 taxes", catalog)).toMatchObject({
      id: "tabler:square-number-2",
      fallbackLetter: "2",
    });
    expect(letterFallback("Écoles", catalog).id).toBe("tabler:square-letter-e");
  });

  it("honours fallbackShape", () => {
    expect(
      letterFallback("Misc", catalog, { fallbackShape: "circle" }).id,
    ).toBe("tabler:circle-letter-m");
  });

  it("uses the neutral glyph without fallbackLetter when there is no usable character", () => {
    for (const label of ["!!!", "日本"]) {
      const m = letterFallback(label, catalog);
      expect(m).toMatchObject({ id: "tabler:category", isFallback: true });
      expect(m.fallbackLetter).toBeUndefined();
    }
  });

  it("uses the neutral glyph when the letter glyph is missing from the set", () => {
    const m = letterFallback("Zoo", catalog);
    expect(m.id).toBe("tabler:category");
    expect(m.fallbackLetter).toBeUndefined();
  });

  it("accepts a custom fallbackIcon and fails clearly when it doesn't exist", () => {
    expect(
      letterFallback("?", catalog, { fallbackIcon: "tabler:heart" }).id,
    ).toBe("tabler:heart");
    expect(() =>
      letterFallback("?", catalog, { fallbackIcon: "tabler:nope" }),
    ).toThrow("Fallback icon tabler:nope is not in the catalog");
  });
});

describe("matcher.best()", () => {
  const keywordIndex = buildKeywordIndex(catalog);

  it("returns the top match when confidence meets minConfidence", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex });
    expect(await m.best("Heart")).toMatchObject({
      id: "tabler:heart",
      confidence: 1,
    });
    expect((await m.best("Heart")).isFallback).toBeUndefined();
  });

  it("falls back to the lettered glyph when nothing matches", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex });
    expect(await m.best("Misc")).toMatchObject({
      id: "tabler:square-letter-m",
      isFallback: true,
      fallbackLetter: "m",
    });
  });

  it("falls back when a keyword-only top confidence is below keywordMinConfidence", async () => {
    // Chosen from the reviewed eval's dev sweep (DECISIONS.md).
    expect(DEFAULT_MIN_CONFIDENCE).toBe(0.6);
    expect(DEFAULT_KEYWORD_MIN_CONFIDENCE).toBe(0.5);
    const strict = await createIconMatcher({
      catalog,
      keywordIndex,
      keywordMinConfidence: 1.01,
    });
    expect((await strict.best("Heart")).isFallback).toBe(true);
    // "Heart misc" covers half the query terms, so confidence 0.5 < 0.6. The
    // fallback uses "h", whose glyph this catalog lacks, so it is neutral.
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      keywordMinConfidence: 0.6,
    });
    const [top] = await m.search("Heart misc");
    expect(top).toMatchObject({ id: "tabler:heart", confidence: 0.5 });
    expect(await m.best("Heart misc")).toMatchObject({
      id: "tabler:category",
      isFallback: true,
    });
  });

  it("uses keywordMinConfidence, not minConfidence, for keyword-only searches", async () => {
    // Keyword-only "Heart misc" has confidence 0.5: kept at the keyword default…
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      minConfidence: 0.99,
    });
    expect((await m.best("Heart misc")).id).toBe("tabler:heart");
    // …and minConfidence applies once semantic ranking takes part (hybrid.test.ts).
  });

  it("passes fallbackShape and fallbackIcon through", async () => {
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      fallbackShape: "circle",
      fallbackIcon: "tabler:heart",
    });
    expect((await m.best("Misc")).id).toBe("tabler:circle-letter-m");
    expect((await m.best("???")).id).toBe("tabler:heart");
  });

  it("never returns a glyph as a ranked match", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex });
    expect(await m.search("square letter")).toEqual([]);
  });
});
