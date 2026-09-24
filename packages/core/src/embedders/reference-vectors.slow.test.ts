import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import { fixturePath } from "../../../../test-support/fixtures.js";
import {
  describeSlow,
  itSlow,
  modelCacheDir,
} from "../../../../test-support/tiers.js";
import { DEFAULT_EMBEDDING_MODEL } from "../embedding.js";
import { createTransformersEmbedder } from "./transformers.js";

interface Reference {
  model: string;
  dtype: "q8";
  vectors: { kind: "query" | "document"; text: string; vector: number[] }[];
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return dot / Math.sqrt(na * nb);
}

// §11.1 M2: real-model embedding of fixed sentences matches committed
// reference vectors (cosine ≥ 0.999). Regenerate with `npm run fixtures:vectors`.
describeSlow("real model reference vectors", () => {
  itSlow("q8 embeddings match the committed references", async () => {
    const ref = JSON.parse(
      await readFile(
        fixturePath("reference-vectors", "bge-small-en-v1.5.q8.json"),
        "utf8",
      ),
    ) as Reference;
    expect(ref.model).toBe(DEFAULT_EMBEDDING_MODEL);
    const embedder = createTransformersEmbedder({
      cacheDir: modelCacheDir(),
      dtype: ref.dtype,
    });
    for (const r of ref.vectors) {
      const [v] = await embedder.embed([r.text], r.kind);
      expect(v).toHaveLength(r.vector.length);
      expect(
        cosine(v ?? [], r.vector),
        `${r.kind}: ${r.text}`,
      ).toBeGreaterThanOrEqual(0.999);
    }
  });

  // The quantised weights we ship must track full precision. (The model card's
  // printed "Hello world." values don't reproduce with transformers.js 4.3.0 for
  // any dtype; see DECISIONS.md, so they are not used as an anchor.)
  itSlow("q8 embeddings agree with fp32 (cosine ≥ 0.98)", async () => {
    const ref = JSON.parse(
      await readFile(
        fixturePath("reference-vectors", "bge-small-en-v1.5.q8.json"),
        "utf8",
      ),
    ) as Reference;
    const fp32 = createTransformersEmbedder({
      cacheDir: modelCacheDir(),
      dtype: "fp32",
    });
    for (const r of ref.vectors) {
      const [v] = await fp32.embed([r.text], r.kind);
      expect(
        cosine(v ?? [], r.vector),
        `${r.kind}: ${r.text}`,
      ).toBeGreaterThanOrEqual(0.98);
    }
  });
});
