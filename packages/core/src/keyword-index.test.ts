import { describe, expect, it } from "vitest";
import {
  buildKeywordIndex,
  foldPlural,
  KEYWORD_BOOSTS,
  keywordDocument,
  parseKeywordIndex,
  processTerm,
  tokenize,
} from "./keyword-index.js";
import type { CatalogEntry } from "./types.js";

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
  entry("dog", { tags: ["pet", "animal"], categories: ["animals"] }),
  entry("paw", { tags: ["dog", "pet"] }),
  entry("pets-grid", { categories: ["dog"] }),
  entry("calendar", { tags: ["date", "schedule"] }),
  entry("strawberry", { tags: ["fruit"] }),
  entry("box", { tags: ["package"] }),
];

const ids = (json: string, q: string) =>
  parseKeywordIndex(json)
    .search(q)
    .map((r) => r.id as string);

describe("text processing", () => {
  it("tokenizes on non-alphanumerics, lowercased", () => {
    expect(tokenize("Arrow-bar to_DOWN, 2fa!")).toEqual([
      "arrow",
      "bar",
      "to",
      "down",
      "2fa",
    ]);
  });

  it.each([
    ["dogs", "dog"],
    ["berries", "berry"],
    ["boxes", "box"],
    ["glasses", "glass"],
    ["dishes", "dish"],
    ["bus", "bus"],
    ["class", "class"],
    ["tennis", "tennis"],
    ["gas", "gas"],
    ["dog", "dog"],
    ["100s", "100s"],
  ])("folds plural %s -> %s", (word, folded) => {
    expect(foldPlural(word)).toBe(folded);
  });

  it("drops stopwords and single letters, keeps digits", () => {
    expect(processTerm("The")).toBeNull();
    expect(processTerm("my")).toBeNull();
    expect(processTerm("s")).toBeNull();
    expect(processTerm("2")).toBe("2");
    expect(processTerm("Dogs")).toBe("dog");
  });
});

describe("keywordDocument", () => {
  it("splits name tokens and includes enrichment when given", () => {
    expect(
      keywordDocument(
        entry("arrow-bar-to-down", {
          tags: ["a", "b"],
          categories: ["arrows"],
        }),
        {
          concepts: ["download", "save file"],
          description: "An arrow.",
        },
      ),
    ).toEqual({
      id: "t:arrow-bar-to-down",
      label: "Arrow bar to down",
      name: "arrow bar to down",
      tags: "a b",
      categories: "arrows",
      concepts: "download save file",
      description: "An arrow.",
    });
  });
});

describe("keyword index", () => {
  const json = JSON.stringify(buildKeywordIndex(catalog));

  it("uses the §6.5 starting boosts", () => {
    expect(KEYWORD_BOOSTS).toEqual({
      label: 3,
      name: 3,
      tags: 2,
      categories: 1,
      concepts: 1.5,
      description: 0.5,
    });
  });

  it("ranks label/name above tags above categories", () => {
    expect(ids(json, "dog")).toEqual(["t:dog", "t:paw", "t:pets-grid"]);
  });

  it("folds plurals in queries", () => {
    expect(ids(json, "dogs")[0]).toBe("t:dog");
    expect(ids(json, "strawberries")[0]).toBe("t:strawberry");
    expect(ids(json, "boxes")[0]).toBe("t:box");
  });

  it("matches prefixes of 3+ chars", () => {
    expect(ids(json, "calen")).toEqual(["t:calendar"]);
    expect(ids(json, "ca")).toEqual([]);
  });

  it("fuzzy-matches edit distance 1 for terms of 5+ chars only", () => {
    expect(ids(json, "calendr")).toContain("t:calendar");
    expect(ids(json, "schedle")).toContain("t:calendar");
    expect(ids(json, "dgo")).toEqual([]);
  });

  it("ignores stopwords in queries", () => {
    expect(ids(json, "the dog")).toEqual(ids(json, "dog"));
    expect(ids(json, "the and of")).toEqual([]);
  });

  it("indexes enrichment concepts when provided", () => {
    const enriched = JSON.stringify(
      buildKeywordIndex(
        catalog,
        new Map([["t:box", { concepts: ["moving house"] }]]),
      ),
    );
    expect(ids(enriched, "moving")).toEqual(["t:box"]);
    expect(ids(json, "moving")).toEqual([]);
  });

  it("serialises deterministically", () => {
    expect(JSON.stringify(buildKeywordIndex(catalog))).toBe(json);
  });
});
