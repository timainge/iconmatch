import { describe, expect, it } from "vitest";
import { buildKeywordIndex } from "../keyword-index.js";
import type { CatalogEntry, Manifest } from "../types.js";
import {
  DEFAULT_FILES,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  SCHEMA_VERSION,
} from "./loaders.js";
import { IconMatchDataError, memorySource, type DataSource } from "./source.js";

const heart: CatalogEntry = {
  id: "t:heart",
  set: "t",
  name: "heart",
  label: "Heart",
  tags: ["love"],
  categories: [],
  variants: ["outline"],
  license: "MIT",
};

const manifest: Manifest = {
  schemaVersion: 1,
  builtAt: "2026-09-24T00:00:00.000Z",
  sets: [{ id: "t", version: "1.0.0", license: "MIT", count: 1 }],
  files: { ...DEFAULT_FILES, catalog: "cat-v2.json" },
};

const files = {
  "manifest.json": JSON.stringify(manifest),
  "catalog.json": JSON.stringify([heart]),
  "cat-v2.json": JSON.stringify([{ ...heart, id: "t:heart-v2" }]),
  "keyword-index.json": JSON.stringify(buildKeywordIndex([heart])),
  "svgs.json": JSON.stringify({
    "t:heart": { outline: { body: "<path/>", width: 24, height: 24 } },
  }),
  "broken.json": "{",
};

/** Records which files were read, to prove loaders read only their own artifact. */
function recording(source: DataSource) {
  const reads: string[] = [];
  return {
    reads,
    source: {
      read: (f: string) => (reads.push(f), source.read(f)),
    } satisfies DataSource,
  };
}

describe("loaders", () => {
  it("each loader reads exactly one artifact", async () => {
    const r = recording(memorySource(files));
    await loadCatalog(r.source);
    await loadSvgs(r.source);
    await loadKeywordIndex(r.source);
    await loadManifest(r.source);
    expect(r.reads).toEqual([
      "catalog.json",
      "svgs.json",
      "keyword-index.json",
      "manifest.json",
    ]);
  });

  it("loads the catalog, svgs and a searchable keyword index", async () => {
    const src = memorySource(files);
    expect(await loadCatalog(src)).toEqual([heart]);
    expect((await loadSvgs(src))["t:heart"]?.outline?.width).toBe(24);
    const index = await loadKeywordIndex(src);
    expect(index.search("hearts").map((r) => r.id as string)).toEqual([
      "t:heart",
    ]);
  });

  it("uses manifest file names when a manifest is given", async () => {
    const src = memorySource(files);
    const m = await loadManifest(src);
    expect(m).toEqual(manifest);
    expect((await loadCatalog(src, { manifest: m }))[0]?.id).toBe("t:heart-v2");
  });

  it("rejects an unsupported manifest schemaVersion", async () => {
    expect(SCHEMA_VERSION).toBe(1);
    const src = memorySource({
      "manifest.json": JSON.stringify({ ...manifest, schemaVersion: 2 }),
    });
    await expect(loadManifest(src)).rejects.toThrow(
      /schemaVersion 2 is not supported/,
    );
  });

  it("names the file on invalid JSON or wrong shape", async () => {
    const bad = memorySource({
      "catalog.json": "{",
      "svgs.json": "[]",
      "keyword-index.json": "{}",
    });
    await expect(loadCatalog(bad)).rejects.toThrow(
      "catalog.json: is not valid JSON",
    );
    await expect(loadSvgs(bad)).rejects.toThrow("svgs.json: is not an SVG map");
    await expect(loadKeywordIndex(bad)).rejects.toBeInstanceOf(
      IconMatchDataError,
    );
    const notEntries = memorySource({ "catalog.json": "[{}]" });
    await expect(loadCatalog(notEntries)).rejects.toThrow(
      "is not an array of catalog entries",
    );
    await expect(
      loadManifest(memorySource({ "manifest.json": "[]" })),
    ).rejects.toThrow("is not a manifest object");
  });
});
