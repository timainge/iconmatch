/**
 * Reference composition (spec §7.7): a desktop (Tauri-style) app that bundles
 * every artifact and the embedding model, and runs fully offline.
 */
import {
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  loadVectors,
  svgsFromArtifact,
  type Embedder,
  type IconMatcher,
} from "@iconmatch/core";
import { createTransformersEmbedder } from "@iconmatch/core/embedder-transformers";
import { fsSource } from "@iconmatch/core/node";

export interface LocalOptions {
  /** Directory with manifest.json and every artifact (e.g. app resources). */
  dataDir: string;
  /** Directory holding `<model id>/…` model files (config, tokenizer, onnx/). */
  modelDir: string;
  /** Override the local model embedder (tests). */
  embedder?: Embedder;
}

/** Everything local: no network access, model loaded on the first text search. */
export async function createLocalMatcher(
  options: LocalOptions,
): Promise<IconMatcher> {
  const source = fsSource(options.dataDir);
  const manifest = await loadManifest(source);
  if (!manifest.embedding)
    throw new Error("local-full needs data built with embeddings");
  const [catalog, keywordIndex, vectors, svgs] = await Promise.all([
    loadCatalog(source, { manifest }),
    loadKeywordIndex(source, { manifest }),
    loadVectors(source, manifest),
    loadSvgs(source, { manifest }),
  ]);
  const embedder =
    options.embedder ??
    createTransformersEmbedder({
      model: manifest.embedding.model,
      modelLocation: options.modelDir,
      localOnly: true,
    });
  return createIconMatcher({
    catalog,
    keywordIndex,
    vectors,
    embedder,
    manifest,
    svgs: svgsFromArtifact(svgs),
  });
}
