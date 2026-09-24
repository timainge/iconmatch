import { beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { buildKeywordIndex } from "./keyword-index.js";
import { KEYWORD_TOP_K } from "./keyword.js";
import { createIconMatcher, type IconMatcherParts } from "./matcher.js";
import type { CatalogEntry } from "./types.js";
import { VECTOR_TOP_K } from "./vector.js";
import { decodeVectors, encodeVectors } from "./vectors.js";

// Spec §7.2 steps 2–3: keyword and vector search each contribute their top 50
// to fusion, so even a huge `limit` can't exceed the union of the two.
const catalog: CatalogEntry[] = Array.from({ length: 120 }, (_, i) => ({
  id: `t:pet-${String(i).padStart(3, "0")}`,
  set: "t",
  name: `pet-${String(i).padStart(3, "0")}`,
  label: `Pet ${String(i)}`,
  tags: ["pet", `variant${String(i)}`],
  categories: [],
  variants: ["outline"],
  license: "MIT",
}));
let parts: Required<
  Pick<IconMatcherParts, "catalog" | "keywordIndex" | "vectors" | "embedder">
>;

beforeAll(async () => {
  const fake = createFakeEmbedder({ dims: 16 });
  const docs = await fake.embed(
    catalog.map((e) => `${e.label}. Tags: ${e.tags.join(", ")}.`),
    "document",
  );
  const vectors = decodeVectors(
    encodeVectors(docs, 16, "int8").buffer as ArrayBuffer,
    catalog.map((e) => e.id),
    16,
    "int8",
  );
  parts = {
    catalog,
    keywordIndex: buildKeywordIndex(catalog),
    vectors,
    embedder: createFakeEmbedder({ dims: 16 }),
  };
});

describe("top-50 per ranking", () => {
  it("uses 50 for both rankings", () => {
    expect(KEYWORD_TOP_K).toBe(50);
    expect(VECTOR_TOP_K).toBe(50);
  });

  it("keyword-only returns at most 50 of 120 matching icons", async () => {
    const m = await createIconMatcher({
      catalog,
      keywordIndex: parts.keywordIndex,
    });
    expect(await m.search("pet", { limit: 1000 })).toHaveLength(50);
  });

  it("vector-only returns at most 50", async () => {
    const m = await createIconMatcher({
      catalog,
      vectors: parts.vectors,
      embedder: parts.embedder,
    });
    expect(await m.search("pet", { limit: 1000 })).toHaveLength(50);
    expect(
      m.searchByEmbedding(
        (await parts.embedder.embed(["pet"], "query"))[0] ?? [],
        { limit: 1000 },
      ),
    ).toHaveLength(50);
  });

  it("hybrid fuses at most 50 + 50 candidates", async () => {
    const m = await createIconMatcher(parts);
    const results = await m.search("pet", { limit: 1000 });
    expect(results.length).toBeGreaterThanOrEqual(50);
    expect(results.length).toBeLessThanOrEqual(100);
    for (const r of results)
      expect(r.matchedOn.keyword || r.matchedOn.vector).toBe(true);
  });
});
