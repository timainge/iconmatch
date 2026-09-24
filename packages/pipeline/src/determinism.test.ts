import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTransformersEmbedder } from "iconmatch/embedder-transformers";
import type { CatalogEntry, Embedder } from "iconmatch";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { itSlow, modelCacheDir } from "../../../test-support/tiers.js";
import { createTablerAdapter } from "./adapters/tabler.js";
import { runEmbed } from "./embed.js";
import { ingest, writeIngest } from "./ingest.js";

// Spec §10 / §11.1 M2: running ingest + embed twice gives identical artifacts.
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function build(
  embedder: Embedder,
  limit?: number,
): Promise<Record<string, string>> {
  const dir = await mkdtemp(join(tmpdir(), "iconmatch-det-"));
  dirs.push(dir);
  const result = await ingest([createTablerAdapter({ log: () => undefined })]);
  await writeIngest(result, dir);
  if (limit !== undefined) {
    const catalog = result.catalog.slice(0, limit) satisfies CatalogEntry[];
    await writeFile(join(dir, "catalog.json"), JSON.stringify(catalog) + "\n");
  }
  await runEmbed(dir, { embedder });
  const hashes: Record<string, string> = {};
  for (const f of (await readdir(dir)).sort()) {
    hashes[f] = createHash("sha256")
      .update(await readFile(join(dir, f)))
      .digest("hex");
  }
  return hashes;
}

describe("determinism", () => {
  it("ingest + embed twice → identical artifacts (fake embedder)", async () => {
    const a = await build(createFakeEmbedder({ dims: 64 }));
    const b = await build(createFakeEmbedder({ dims: 64 }));
    expect(Object.keys(a)).toEqual([
      "catalog.json",
      "embed-meta.json",
      "svgs.json",
      "vector-ids.json",
      "vectors.bin",
    ]);
    expect(b).toEqual(a);
  });

  itSlow(
    "ingest + embed twice → identical artifacts (real model, 300 icons)",
    async () => {
      const embedder = () =>
        createTransformersEmbedder({ cacheDir: modelCacheDir() });
      const a = await build(embedder(), 300);
      const b = await build(embedder(), 300);
      expect(b).toEqual(a);
    },
  );
});
