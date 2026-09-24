import { describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { buildKeywordIndex } from "./keyword-index.js";
import { createIconMatcher, EXPANSION_ORIGINAL_WEIGHT } from "./matcher.js";
import type { CatalogEntry } from "./types.js";
import { decodeVectors, encodeVectors } from "./vectors.js";

function entry(name: string, tags: string[]): CatalogEntry {
  return {
    id: `t:${name}`,
    set: "t",
    name,
    label: name,
    tags,
    categories: [],
    variants: ["outline"],
    license: "MIT",
  };
}

// "Admin" alone matches only clipboard; the expansions reach folder and stamp.
const catalog = [
  entry("clipboard", ["admin", "paperwork"]),
  entry("folder", ["documents", "files"]),
  entry("stamp", ["approval", "office"]),
  entry("pizza", ["food"]),
];
const keywordIndex = buildKeywordIndex(catalog);

describe("expandQuery (spec §7.3)", () => {
  it("searches the original plus each expansion and fuses them", async () => {
    const asked: string[] = [];
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      expandQuery: (q) => {
        asked.push(q);
        return Promise.resolve(["folder of documents", "office stamp"]);
      },
    });
    const ids = (await m.search("Admin")).map((r) => r.id);
    expect(asked).toEqual(["Admin"]);
    expect(ids.slice(0, 3).sort()).toEqual([
      "t:clipboard",
      "t:folder",
      "t:stamp",
    ]);
    expect(ids).not.toContain("t:pizza");
  });

  it("weights the original query ×2 in the fusion", async () => {
    expect(EXPANSION_ORIGINAL_WEIGHT).toBe(2);
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      expandQuery: () => Promise.resolve(["pizza"]),
    });
    const [first, second] = await m.search("clipboard");
    // Both are rank 1 in their own query; the original's hit wins on weight.
    expect(first?.id).toBe("t:clipboard");
    expect(second?.id).toBe("t:pizza");
    expect((first?.score ?? 0) / (second?.score ?? 1)).toBeCloseTo(2, 6);
  });

  it("ignores empty, blank and duplicate-of-original expansions", async () => {
    const embedder = createFakeEmbedder({ dims: 16 });
    const vecs = await createFakeEmbedder({ dims: 16 }).embed(
      catalog.map((e) => e.name),
      "document",
    );
    const vectors = decodeVectors(
      encodeVectors(vecs, 16, "int8").buffer as ArrayBuffer,
      catalog.map((e) => e.id),
      16,
      "int8",
    );
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder,
      expandQuery: () => Promise.resolve(["", "  ", "ADMIN", "folder"]),
    });
    await m.search("Admin");
    expect(embedder.calls.map((c) => c.texts[0])).toEqual(["Admin", "folder"]);
  });

  it("falls back to the plain search when the expander fails, reporting the error", async () => {
    const errors: unknown[] = [];
    const plain = await createIconMatcher({ catalog, keywordIndex });
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      expandQuery: () => Promise.reject(new Error("LLM down")),
      onExpandError: (e) => errors.push(e),
    });
    expect(await m.search("admin")).toEqual(await plain.search("admin"));
    expect(errors).toEqual([new Error("LLM down")]);
  });

  it("takes the best confidence across queries and doesn't expand punctuation-only queries", async () => {
    let calls = 0;
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      expandQuery: () => {
        calls++;
        return Promise.resolve(["pizza"]);
      },
    });
    const pizza = (await m.search("dinner")).find((r) => r.id === "t:pizza");
    expect(pizza?.confidence).toBe(1);
    expect(await m.search("???")).toEqual([]);
    expect(calls).toBe(1);
  });
});
