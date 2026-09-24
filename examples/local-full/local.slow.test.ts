import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTransformersEmbedder } from "iconmatch/embedder-transformers";
import { expect } from "vitest";
import { writeTabler200DataDir } from "../../test-support/data-dir.js";
import {
  describeSlow,
  itSlow,
  modelCacheDir,
} from "../../test-support/tiers.js";
import { createLocalMatcher } from "./local.js";

// Spec §7.7: local-full with the real model, offline (localOnly) from a local model directory.
describeSlow("examples/local-full (real model, offline)", () => {
  itSlow("searches with the local model and never goes online", async () => {
    // Build the data with the real model (downloads into the cache if needed).
    const builder = createTransformersEmbedder({ cacheDir: modelCacheDir() });
    const dataDir = await writeTabler200DataDir(builder);
    try {
      const m = await createLocalMatcher({
        dataDir,
        modelDir: modelCacheDir(),
      });
      const results = await m.search("Groceries", { limit: 5 });
      expect(results.map((r) => r.id)).toContain("tabler:shopping-cart");
      expect(results[0]?.matchedOn.vector).toBe(true);
      const best = await m.best("Dog grooming");
      expect(best.isFallback).toBeUndefined();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  itSlow("refuses to download when the model is not in modelDir", async () => {
    const dataDir = await writeTabler200DataDir(
      createTransformersEmbedder({ cacheDir: modelCacheDir() }),
    );
    const emptyModelDir = await mkdtemp(join(tmpdir(), "iconmatch-nomodel-"));
    try {
      const m = await createLocalMatcher({ dataDir, modelDir: emptyModelDir });
      await expect(m.search("Groceries")).rejects.toThrow();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
      await rm(emptyModelDir, { recursive: true, force: true });
    }
  });
});
