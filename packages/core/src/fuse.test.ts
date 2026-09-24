import { describe, expect, it } from "vitest";
import {
  fuse,
  hybridConfidence,
  KEYWORD_CONFIDENCE_BUMP,
  RRF_K,
} from "./fuse.js";

describe("fuse (RRF)", () => {
  it("scores Σ 1/(k + rank) with 1-based ranks and k = 60", () => {
    expect(RRF_K).toBe(60);
    const out = fuse([{ ids: ["a", "b"] }, { ids: ["b", "c"] }]);
    expect(out.map((h) => h.id)).toEqual(["b", "a", "c"]);
    expect(out[0]?.score).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(out[1]?.score).toBeCloseTo(1 / 61, 12);
    expect(out[2]?.score).toBeCloseTo(1 / 62, 12);
  });

  it("applies ranking weights and a custom k", () => {
    const out = fuse([{ ids: ["a"], weight: 2 }, { ids: ["b"] }], { k: 0 });
    expect(out).toEqual([
      { id: "a", score: 2 },
      { id: "b", score: 1 },
    ]);
  });

  it("breaks score ties by id and handles empty rankings", () => {
    expect(fuse([{ ids: ["z"] }, { ids: ["y"] }]).map((h) => h.id)).toEqual([
      "y",
      "z",
    ]);
    expect(fuse([{ ids: [] }])).toEqual([]);
  });
});

describe("hybridConfidence", () => {
  it("is the cosine, bumped by 0.1 when keyword-matched, clamped to 0..1", () => {
    expect(KEYWORD_CONFIDENCE_BUMP).toBe(0.1);
    expect(hybridConfidence(0.42, false)).toBeCloseTo(0.42, 12);
    expect(hybridConfidence(0.42, true)).toBeCloseTo(0.52, 12);
    expect(hybridConfidence(0.95, true)).toBe(1);
    expect(hybridConfidence(-0.2, false)).toBe(0);
    expect(hybridConfidence(Number.NaN, true)).toBe(0);
  });
});
