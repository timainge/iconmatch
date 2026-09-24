import { expect } from "vitest";
import {
  describeSlow,
  itSlow,
  modelCacheDir,
} from "../../../../test-support/tiers.js";
import { DEFAULT_EMBEDDING_DIMS } from "../embedding.js";
import { createTransformersEmbedder } from "./transformers.js";

const cos = (a: Float32Array, b: Float32Array) =>
  a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

describeSlow("transformers embedder (real model)", () => {
  itSlow(
    "lazy-loads bge-small, returns normalised 384-dim vectors that rank sensibly",
    async () => {
      const e = createTransformersEmbedder({ cacheDir: modelCacheDir() });
      expect(e.loaded).toBe(false);
      const [q] = await e.embed(["dog grooming"], "query");
      const [near, far] = await e.embed(
        ["Dog. Tags: pet, animal, puppy", "Calendar. Tags: date, schedule"],
        "document",
      );
      if (!q || !near || !far) throw new Error("missing vectors");
      expect(e.loaded).toBe(true);
      expect(q).toHaveLength(DEFAULT_EMBEDDING_DIMS);
      expect(cos(q, q)).toBeCloseTo(1, 4);
      expect(cos(q, near)).toBeGreaterThan(cos(q, far));
    },
  );
});
