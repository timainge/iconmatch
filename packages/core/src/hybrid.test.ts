import { beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { IconMatchCapabilityError } from "./errors.js";
import { hybridConfidence } from "./fuse.js";
import { buildKeywordIndex } from "./keyword-index.js";
import { createIconMatcher } from "./matcher.js";
import type { CatalogEntry } from "./types.js";
import {
  decodeVectors,
  encodeVectors,
  type VectorArtifact,
} from "./vectors.js";

function entry(
  name: string,
  tags: string[],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    id: `t:${name}`,
    set: "t",
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " "),
    tags,
    categories: [],
    variants: ["outline"],
    license: "MIT",
    ...extra,
  };
}

const catalog = [
  entry("dog", ["pet", "animal", "puppy"]),
  entry("scissors", ["cut", "grooming", "haircut"]),
  entry("calendar", ["date", "schedule"]),
  entry("category", []),
  entry("square-letter-g", ["grooming"], { glyph: "letter" }),
];
const keywordIndex = buildKeywordIndex(catalog);
let vectors: VectorArtifact;

beforeAll(async () => {
  // Document text as in spec §6.4 (label + tags) through the fake embedder.
  const docs = catalog.map((e) => `${e.label}. Tags: ${e.tags.join(", ")}.`);
  const vecs = await createFakeEmbedder({ dims: 64 }).embed(docs, "document");
  const ids = catalog.map((e) => e.id);
  vectors = decodeVectors(
    encodeVectors(vecs, 64, "int8").buffer as ArrayBuffer,
    ids,
    64,
    "int8",
  );
});

describe("hybrid search", () => {
  it("fuses keyword and vector rankings and flags matchedOn", async () => {
    const embedder = createFakeEmbedder({ dims: 64 });
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder,
    });
    const results = await m.search("Dog grooming");
    expect(
      results
        .slice(0, 2)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["t:dog", "t:scissors"]);
    const dog = results.find((r) => r.id === "t:dog");
    expect(dog?.matchedOn).toEqual({ keyword: true, vector: true });
    // Raw query, embedded once as a query.
    expect(embedder.calls).toEqual([
      { texts: ["Dog grooming"], kind: "query" },
    ]);
  });

  it("sets confidence from cosine, bumped by keyword match", async () => {
    const embedder = createFakeEmbedder({ dims: 64 });
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder,
    });
    const [q] = await createFakeEmbedder({ dims: 64 }).embed(
      ["Dog grooming"],
      "query",
    );
    const results = await m.search("Dog grooming", { limit: 5 });
    for (const r of results) {
      const row = vectors.ids.indexOf(r.id);
      let dot = 0;
      let n = 0;
      for (let i = 0; i < 64; i++) {
        const x =
          (vectors.data[row * 64 + i] ?? 0) * (vectors.scales?.[row] ?? 0);
        dot += x * (q?.[i] ?? 0);
        n += x * x;
      }
      expect(r.confidence).toBeCloseTo(
        hybridConfidence(dot / Math.sqrt(n), r.matchedOn.keyword),
        2,
      );
    }
  });

  it("orders by fused RRF score", async () => {
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder: createFakeEmbedder({ dims: 64 }),
    });
    const scores = (await m.search("dog grooming")).map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("excludes glyphs from the vector ranking too", async () => {
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder: createFakeEmbedder({ dims: 64 }),
    });
    expect(
      (await m.search("grooming", { limit: 10 })).map((r) => r.id),
    ).not.toContain("t:square-letter-g");
  });

  it("works vector-only without a keyword index", async () => {
    const m = await createIconMatcher({
      catalog,
      vectors,
      embedder: createFakeEmbedder({ dims: 64 }),
    });
    const [top] = await m.search("puppy");
    expect(top).toMatchObject({
      id: "t:dog",
      matchedOn: { keyword: false, vector: true },
    });
  });

  it("stays keyword-only when vectors come without an embedder", async () => {
    const m = await createIconMatcher({ catalog, keywordIndex, vectors });
    const [top] = await m.search("dog");
    expect(top?.matchedOn).toEqual({ keyword: true, vector: false });
  });

  it("needs a keyword index or vectors + embedder to search", async () => {
    const m = await createIconMatcher({ catalog, vectors });
    await expect(m.search("dog")).rejects.toBeInstanceOf(
      IconMatchCapabilityError,
    );
  });

  it("does not embed an empty or punctuation-only query", async () => {
    const embedder = createFakeEmbedder({ dims: 64 });
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder,
    });
    expect(await m.search("   ")).toEqual([]);
    expect(await m.search("!!! ???")).toEqual([]);
    expect(embedder.calls).toEqual([]);
  });

  it("best() falls back when the hybrid confidence is below minConfidence", async () => {
    const embedder = createFakeEmbedder({ dims: 64 });
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder,
      minConfidence: 0.99,
      fallbackIcon: "t:category",
    });
    expect(await m.best("Zebra crossing")).toMatchObject({
      id: "t:category",
      isFallback: true,
    });
    const lenient = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder,
      minConfidence: 0,
    });
    expect((await lenient.best("dog")).id).toBe("t:dog");
  });
});
