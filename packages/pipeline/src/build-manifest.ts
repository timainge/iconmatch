import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_FILES,
  SCHEMA_VERSION,
  type Manifest,
} from "@iconmatch/core";
import { manifestEmbedding } from "./embed.js";
import { EMBED_META_FILE, type EmbedMeta } from "./embed.js";

/**
 * Manifest for an unpackaged `build/` dir, derived from `embed-meta.json`
 * (no embedding section if `embed` hasn't run). The `package` stage writes
 * the real one (spec §6.6).
 */
export async function readBuildManifest(buildDir: string): Promise<Manifest> {
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: new Date(0).toISOString(),
    sets: [],
    enrichment: { mode: "none" },
    files: { ...DEFAULT_FILES },
  };
  try {
    const meta = JSON.parse(
      await readFile(join(buildDir, EMBED_META_FILE), "utf8"),
    ) as EmbedMeta;
    manifest.embedding = manifestEmbedding(meta);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return manifest;
}
