import { describe, expect, it } from "vitest";
import {
  createFakeEmbedder,
  FAKE_MODEL_ID,
  type FakeEmbedder,
} from "./fake-embedder.js";

async function embedOne(
  e: FakeEmbedder,
  text: string,
  kind: "query" | "document" = "query",
): Promise<Float32Array> {
  const [v] = await e.embed([text], kind);
  if (!v) throw new Error("embedder returned no vector");
  return v;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

describe("createFakeEmbedder", () => {
  it("returns L2-normalised vectors of the configured dims", async () => {
    const v = await embedOne(createFakeEmbedder({ dims: 16 }), "dog grooming");
    expect(v).toHaveLength(16);
    expect(cosine(v, v)).toBeCloseTo(1, 5);
  });

  it("defaults to 384 dims and a fake model id", async () => {
    const e = createFakeEmbedder();
    expect(e.modelId).toBe(FAKE_MODEL_ID);
    expect(await embedOne(e, "x", "document")).toHaveLength(384);
  });

  it("is deterministic across instances", async () => {
    const a = await embedOne(createFakeEmbedder(), "Heart");
    const b = await embedOne(createFakeEmbedder(), "heart", "document");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("scores texts sharing words above unrelated texts", async () => {
    const e = createFakeEmbedder();
    const q = await embedOne(e, "dog grooming");
    const near = await embedOne(e, "Dog. Tags: pet, animal", "document");
    const far = await embedOne(e, "Calendar. Tags: date", "document");
    expect(cosine(q, near)).toBeGreaterThan(cosine(q, far));
  });

  it("gives token-less text a finite unit vector", async () => {
    const v = await embedOne(createFakeEmbedder({ dims: 8 }), "!!!");
    expect(v.every(Number.isFinite)).toBe(true);
    expect(cosine(v, v)).toBeCloseTo(1, 5);
  });

  it("records calls so tests can assert when embedding ran", async () => {
    const e = createFakeEmbedder({ modelId: "Xenova/bge-small-en-v1.5" });
    expect(e.calls).toHaveLength(0);
    await e.embed(["a", "b"], "document");
    expect(e.calls).toEqual([{ texts: ["a", "b"], kind: "document" }]);
    expect(e.modelId).toBe("Xenova/bge-small-en-v1.5");
  });
});
