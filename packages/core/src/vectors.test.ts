import { describe, expect, it } from "vitest";
import {
  decodeVectors,
  encodeVectors,
  quantiseInt8,
  vectorsByteLength,
} from "./vectors.js";

const unit = (xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs.map((x) => x / n));
};

describe("quantiseInt8", () => {
  it("maps the largest magnitude to ±127 with a per-vector scale", () => {
    const { q, scale } = quantiseInt8([0.5, -1, 0.25]);
    expect(Array.from(q)).toEqual([64, -127, 32]);
    expect(scale).toBeCloseTo(1 / 127, 9);
  });

  it("handles the zero vector", () => {
    expect(quantiseInt8([0, 0])).toEqual({
      q: new Int8Array([0, 0]),
      scale: 1,
    });
  });
});

describe("vectors.bin encoding", () => {
  const vectors = [unit([1, 2, 3]), unit([-3, 0.5, 2]), unit([0, 0, 1])];
  const ids = ["a", "b", "c"];

  it("int8 layout: padded int8 rows then float32 scales", () => {
    // 3×3 = 9 int8 bytes, padded to 12, then 3 scales × 4 bytes.
    expect(vectorsByteLength(3, 3, "int8")).toBe(24);
    const bytes = encodeVectors(vectors, 3, "int8");
    expect(bytes.byteLength).toBe(24);
    expect(Array.from(bytes.slice(9, 12))).toEqual([0, 0, 0]);
  });

  it("round-trips int8 within quantisation error", () => {
    const bytes = encodeVectors(vectors, 3, "int8");
    const art = decodeVectors(bytes.buffer as ArrayBuffer, ids, 3, "int8");
    expect(art).toMatchObject({ ids, dims: 3, quantisation: "int8" });
    vectors.forEach((v, r) => {
      for (let i = 0; i < 3; i++) {
        const back = (art.data[r * 3 + i] ?? 0) * (art.scales?.[r] ?? 0);
        expect(Math.abs(back - (v[i] ?? 0))).toBeLessThan(0.005);
      }
    });
  });

  it("round-trips float32 exactly", () => {
    const bytes = encodeVectors(vectors, 3, "float32");
    expect(bytes.byteLength).toBe(36);
    const art = decodeVectors(bytes.buffer as ArrayBuffer, ids, 3, "float32");
    expect(Array.from(art.data)).toEqual(vectors.flatMap((v) => Array.from(v)));
    expect(art.scales).toBeUndefined();
  });

  it("rejects wrong dims and wrong byte lengths", () => {
    expect(() => encodeVectors([unit([1, 2])], 3, "int8")).toThrow(
      "vector 0 has 2 dims, expected 3",
    );
    const bytes = encodeVectors(vectors, 3, "int8");
    expect(() =>
      decodeVectors(bytes.buffer as ArrayBuffer, ["a"], 3, "int8"),
    ).toThrow("vectors.bin is 24 bytes; expected 8 for 1×3 int8");
  });
});
