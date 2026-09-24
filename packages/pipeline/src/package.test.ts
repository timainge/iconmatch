import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  loadVectors,
  QUERY_PREFIX,
  svgsFromArtifact,
} from "iconmatch";
import { fsSource } from "iconmatch/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { runEmbed } from "./embed.js";
import { BUILD_ENRICHMENTS_FILE } from "./enrich/stage.js";
import { ingest, writeIngest } from "./ingest.js";
import { runIndex } from "./index.js";
import { formatSizes, runPackage, SIZE_TARGETS } from "./package.js";

const enrich = {
  mode: "none" as const,
  textModel: "qwen2.5:7b-instruct",
  visionModel: "qwen2.5vl:7b",
};
let build: string;
let data: string;

const adapter = (license = true) => ({
  id: "demo",
  version: "1.2.3",
  license: {
    spdx: "MIT",
    url: "https://example.com",
    attributionRequired: false,
  },
  variants: ["outline" as const],
  ...(license && { licenseText: () => Promise.resolve("MIT demo licence\n") }),
  load: () =>
    Promise.resolve([
      {
        name: "heart",
        variants: { outline: { body: "<path/>", width: 24, height: 24 } },
        tags: ["love"],
        categories: [],
      },
      {
        name: "dog",
        variants: { outline: { body: "<circle/>", width: 24, height: 24 } },
        tags: ["pet"],
        categories: [],
      },
    ]),
});

async function buildAll(withLicense = true) {
  await writeIngest(await ingest([adapter(withLicense)]), build);
  await runEmbed(build, { embedder: createFakeEmbedder({ dims: 8 }) });
  await runIndex(build);
}

beforeEach(async () => {
  build = await mkdtemp(join(tmpdir(), "iconmatch-build-"));
  data = await mkdtemp(join(tmpdir(), "iconmatch-data-"));
});
afterEach(async () => {
  await rm(build, { recursive: true, force: true });
  await rm(data, { recursive: true, force: true });
});

describe("runPackage (spec §6.6, §8)", () => {
  it("writes a §6.6 manifest and artifacts that core loads into a working matcher", async () => {
    await buildAll();
    const { manifest } = await runPackage(build, data, {
      enrich,
      builtAt: "2026-09-25T00:00:00.000Z",
    });
    expect(manifest).toEqual({
      schemaVersion: 1,
      builtAt: "2026-09-25T00:00:00.000Z",
      sets: [
        {
          id: "demo",
          version: "1.2.3",
          license: "MIT",
          count: 2,
          attributionRequired: false,
          url: "https://example.com",
        },
      ],
      enrichment: { mode: "none" },
      files: {
        catalog: "catalog.json",
        svgs: "svgs.json",
        vectors: "vectors.bin",
        vectorIds: "vector-ids.json",
        keywordIndex: "keyword-index.json",
      },
      embedding: {
        model: "fake/hash-embedder",
        dims: 8,
        quantisation: "int8",
        queryPrefix: QUERY_PREFIX,
      },
    });
    const src = fsSource(data);
    const m = await loadManifest(src);
    const matcher = await createIconMatcher({
      catalog: await loadCatalog(src, { manifest: m }),
      keywordIndex: await loadKeywordIndex(src, { manifest: m }),
      vectors: await loadVectors(src, m),
      svgs: svgsFromArtifact(await loadSvgs(src, { manifest: m })),
      embedder: createFakeEmbedder({ dims: 8 }),
      manifest: m,
    });
    expect((await matcher.search("heart"))[0]?.id).toBe("demo:heart");
    expect(matcher.attributions()).toEqual([]);
  });

  it("copies each set's licence into licenses/ and fails without one", async () => {
    await buildAll();
    await runPackage(build, data, { enrich });
    expect(await readFile(join(data, "licenses", "demo.txt"), "utf8")).toBe(
      "MIT demo licence\n",
    );
    const other = await mkdtemp(join(tmpdir(), "iconmatch-build-"));
    try {
      await writeIngest(await ingest([adapter(false)]), other);
      await runEmbed(other, { embedder: createFakeEmbedder({ dims: 8 }) });
      await runIndex(other);
      await expect(runPackage(other, data, { enrich })).rejects.toThrow(
        "No licence text for set demo",
      );
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("records text enrichment only when enrichments exist", async () => {
    await buildAll();
    await writeFile(
      join(build, BUILD_ENRICHMENTS_FILE),
      JSON.stringify({
        "demo:heart": { description: "x", concepts: ["a"], domains: ["b"] },
      }),
    );
    const text = await runPackage(build, data, {
      enrich: { ...enrich, mode: "text" },
    });
    expect(text.manifest.enrichment).toEqual({
      mode: "text",
      model: "qwen2.5:7b-instruct",
      promptVersion: "text-v1",
    });
    await writeFile(join(build, BUILD_ENRICHMENTS_FILE), "{}\n");
    expect(
      (await runPackage(build, data, { enrich: { ...enrich, mode: "text" } }))
        .manifest.enrichment,
    ).toEqual({ mode: "none" });
  });

  it("reports sizes against the §6.6 targets and never deletes other files", async () => {
    await buildAll();
    await writeFile(join(data, "keep-me.txt"), "user file");
    const { sizes } = await runPackage(build, data, { enrich });
    expect(SIZE_TARGETS).toEqual({
      totalBytes: 8_000_000,
      excludingSvgsBytes: 4_000_000,
    });
    expect(Object.keys(sizes.files)).toEqual(
      expect.arrayContaining([
        "catalog.json",
        "svgs.json",
        "keyword-index.json",
        "vectors.bin",
        "vector-ids.json",
        "manifest.json",
        "licenses/demo.txt",
      ]),
    );
    expect(sizes.excludingSvgs).toBe(
      sizes.total - (sizes.files["svgs.json"] ?? 0),
    );
    expect(sizes.browser).toBe(
      (sizes.files["catalog.json"] ?? 0) +
        (sizes.files["keyword-index.json"] ?? 0),
    );
    expect(sizes.withinTargets).toEqual({ total: true, excludingSvgs: true });
    expect(formatSizes(sizes)).toContain("target ≤ 4 MB: ok");
    expect(await readFile(join(data, "keep-me.txt"), "utf8")).toBe("user file");
  });

  it("fails clearly when an earlier stage hasn't run", async () => {
    await writeIngest(await ingest([adapter()]), build);
    await expect(runPackage(build, data, { enrich })).rejects.toThrow(
      /keyword-index\.json is missing/,
    );
  });
});
