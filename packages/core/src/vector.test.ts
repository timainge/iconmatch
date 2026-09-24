import { describe, expect, it } from "vitest";
import { createVectorSearcher, IconMatchDimensionError } from "./vector.js";
import { decodeVectors, encodeVectors, type Quantisation } from "./vectors.js";

const rows = [
  [1, 0, 0],
  [0.6, 0.8, 0],
  [0, 0, 2], // not unit length: cosine must still be 1 for [0,0,1]
  [-1, 0, 0],
];
const ids = ["t:a", "t:b", "t:c", "t:d"];

function searcher(q: Quantisation) {
  const bytes = encodeVectors(
    rows.map((r) => Float32Array.from(r)),
    3,
    q,
  );
  return createVectorSearcher(
    decodeVectors(bytes.buffer as ArrayBuffer, ids, 3, q),
  );
}

describe.each(["float32", "int8"] as const)(
  "createVectorSearcher (%s)",
  (q) => {
    it("computes cosine similarity for every row", () => {
      const sims = Array.from(searcher(q).similarities([1, 0, 0]));
      expect(sims[0]).toBeCloseTo(1, 2);
      expect(sims[1]).toBeCloseTo(0.6, 2);
      expect(sims[2]).toBeCloseTo(0, 2);
      expect(sims[3]).toBeCloseTo(-1, 2);
    });

    it("is scale-invariant for rows and query", () => {
      expect(searcher(q).similarities([0, 0, 5])[2]).toBeCloseTo(1, 2);
    });

    it("returns best rows first, honouring limit and exclude", () => {
      const s = searcher(q);
      expect(s.search([1, 0.1, 0]).map((h) => h.id)).toEqual([
        "t:a",
        "t:b",
        "t:c",
        "t:d",
      ]);
      expect(
        s
          .search([1, 0.1, 0], { limit: 2, exclude: new Set(["t:a"]) })
          .map((h) => h.id),
      ).toEqual(["t:b", "t:c"]);
    });

    it("throws IconMatchDimensionError on wrong dims", () => {
      expect(() => searcher(q).search([1, 0])).toThrow(IconMatchDimensionError);
      expect(() => searcher(q).search([1, 0])).toThrow(
        "Query vector has 2 dims; the vector index has 3",
      );
    });

    it("returns 0 for a zero or non-finite query", () => {
      expect(Array.from(searcher(q).similarities([0, 0, 0]))).toEqual([
        0, 0, 0, 0,
      ]);
      expect(Array.from(searcher(q).similarities([Number.NaN, 1, 0]))).toEqual([
        0, 0, 0, 0,
      ]);
    });
  },
);

it("int8 cosine stays within 0.01 of float32 on random unit vectors", () => {
  let seed = 7;
  const rand = () =>
    ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
  const dims = 384;
  const vecs = Array.from({ length: 50 }, () =>
    Float32Array.from({ length: dims }, rand),
  );
  const vids = vecs.map((_, i) => `t:${String(i)}`);
  const make = (q: Quantisation) =>
    createVectorSearcher(
      decodeVectors(
        encodeVectors(vecs, dims, q).buffer as ArrayBuffer,
        vids,
        dims,
        q,
      ),
    );
  const query = Float32Array.from({ length: dims }, rand);
  const f = make("float32").similarities(query);
  const i8 = make("int8").similarities(query);
  for (let r = 0; r < vecs.length; r++)
    expect(Math.abs((f[r] ?? 0) - (i8[r] ?? 0))).toBeLessThan(0.01);
});
