import { readFile } from "node:fs/promises";
import { memorySource } from "../packages/core/src/data/source.js";
import {
  DEFAULT_FILES,
  SCHEMA_VERSION,
} from "../packages/core/src/data/loaders.js";
import { QUERY_PREFIX } from "../packages/core/src/embedding.js";
import type {
  CatalogEntry,
  Embedder,
  Manifest,
} from "../packages/core/src/types.js";
import { encodeVectors } from "../packages/core/src/vectors.js";
import { documentText } from "../packages/pipeline/src/embed.js";
import { fixturePath } from "./fixtures.js";

/**
 * A complete in-memory data directory (manifest + every artifact) for the
 * 200-icon fixture, with vectors from the given embedder. Stands in for
 * `packagedSource()` until the `package` stage exists.
 */
export async function tabler200FullSource(embedder: Embedder) {
  const read = (f: string) => readFile(fixturePath("tabler-200", f), "utf8");
  const [catalogJson, svgsJson, indexJson] = await Promise.all([
    read("catalog.json"),
    read("svgs.json"),
    read("keyword-index.json"),
  ]);
  const catalog = JSON.parse(catalogJson) as CatalogEntry[];
  const vectors = await embedder.embed(
    catalog.map((e) => documentText(e)),
    "document",
  );
  const dims = vectors[0]?.length ?? 0;
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: "2026-09-24T00:00:00.000Z",
    sets: [
      {
        id: "tabler",
        version: "3.48.0",
        license: "MIT",
        count: catalog.length,
      },
    ],
    embedding: {
      model: embedder.modelId,
      dims,
      quantisation: "int8",
      queryPrefix: QUERY_PREFIX,
    },
    enrichment: { mode: "none" },
    files: DEFAULT_FILES,
  };
  const files = {
    "manifest.json": JSON.stringify(manifest),
    [DEFAULT_FILES.catalog]: catalogJson,
    [DEFAULT_FILES.svgs]: svgsJson,
    [DEFAULT_FILES.keywordIndex]: indexJson,
    [DEFAULT_FILES.vectors]: encodeVectors(vectors, dims, "int8"),
    [DEFAULT_FILES.vectorIds]: JSON.stringify(catalog.map((e) => e.id)),
  };
  return { source: memorySource(files), files, manifest };
}
