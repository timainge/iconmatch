import { rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeTabler200DataDir } from "../../test-support/data-dir.js";
import { createFakeEmbedder } from "../../test-support/fake-embedder.js";
import { createLocalMatcher } from "./local.js";

// Spec §7.7: local-full reads every artifact from disk; default tier uses the fake embedder.
describe("examples/local-full (fake embedder)", () => {
  let dataDir: string;
  beforeAll(async () => {
    dataDir = await writeTabler200DataDir(createFakeEmbedder({ dims: 32 }));
  });
  afterAll(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("searches hybrid, falls back and renders SVGs from local files", async () => {
    const embedder = createFakeEmbedder({ dims: 32 });
    const m = await createLocalMatcher({
      dataDir,
      modelDir: "/unused",
      embedder,
    });
    const results = await m.search("dog", { limit: 5 });
    expect(results.map((r) => r.id)).toContain("tabler:dog");
    expect(results.some((r) => r.matchedOn.keyword && r.matchedOn.vector)).toBe(
      true,
    );
    expect(embedder.calls).toEqual([{ texts: ["dog"], kind: "query" }]);
    expect((await m.best("!!!")).isFallback).toBe(true);
    expect(await m.svg("tabler:heart")).toMatch(/^<svg /);
    expect(
      m.searchByEmbedding((await embedder.embed(["heart"], "query"))[0] ?? [], {
        limit: 3,
      }),
    ).toHaveLength(3);
  });

  it("rejects an embedder for a different model than the data", async () => {
    await expect(
      createLocalMatcher({
        dataDir,
        modelDir: "/unused",
        embedder: createFakeEmbedder({ dims: 32, modelId: "x/y" }),
      }),
    ).rejects.toThrow('does not match the index model "fake/hash-embedder"');
  });

  it("fails clearly when the data directory is missing", async () => {
    await expect(
      createLocalMatcher({ dataDir: "/nonexistent", modelDir: "/unused" }),
    ).rejects.toThrow("manifest.json");
  });
});
