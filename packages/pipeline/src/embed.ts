import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  encodeVectors,
  findEmbeddingProfile,
  QUERY_PREFIX,
  type CatalogEntry,
  type Embedder,
  type Manifest,
  type Quantisation,
} from "@iconmatch/core";

/** Enrichment fields that feed the document text (spec §6.3, §6.4). */
export interface DocumentEnrichment {
  description?: string;
  concepts?: string[];
  domains?: string[];
}

/**
 * Deterministic document text (spec §6.4), empty sections omitted:
 * `{label}. Tags: …. Category: …. {description} Represents: …. Domains: ….`
 */
export function documentText(
  entry: CatalogEntry,
  enrichment: DocumentEnrichment = {},
): string {
  const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  const parts = [sentence(entry.label)];
  if (entry.tags.length > 0) parts.push(`Tags: ${entry.tags.join(", ")}.`);
  if (entry.categories.length > 0)
    parts.push(`Category: ${entry.categories.join(", ")}.`);
  const description = enrichment.description?.trim();
  if (description) parts.push(sentence(description));
  if (enrichment.concepts?.length)
    parts.push(`Represents: ${enrichment.concepts.join(", ")}.`);
  if (enrichment.domains?.length)
    parts.push(`Domains: ${enrichment.domains.join(", ")}.`);
  return parts.join(" ");
}

/** What the `embed` stage recorded; the `package` stage copies it into the manifest. */
export interface EmbedMeta {
  model: string;
  dims: number;
  quantisation: Quantisation;
  count: number;
}

export const EMBED_META_FILE = "embed-meta.json";

/**
 * The manifest's `embedding` section for a build: the model's registered
 * conventions (spec §15.3), or the bge query prefix for an unregistered model
 * (e.g. the test-only fake embedder).
 */
export function manifestEmbedding(
  meta: EmbedMeta,
): NonNullable<Manifest["embedding"]> {
  const profile = findEmbeddingProfile(meta.model);
  const embedding: NonNullable<Manifest["embedding"]> = {
    model: meta.model,
    dims: meta.dims,
    quantisation: meta.quantisation,
    queryPrefix: profile?.queryPrefix ?? QUERY_PREFIX,
  };
  if (profile && profile.documentPrefix !== "")
    embedding.documentPrefix = profile.documentPrefix;
  if (profile && profile.pooling !== "mean")
    embedding.pooling = profile.pooling;
  return embedding;
}

export interface EmbedOptions {
  embedder: Embedder;
  quantisation?: Quantisation;
  enrichments?: ReadonlyMap<string, DocumentEnrichment>;
  /** Texts per `embed()` call. Default 32. */
  batchSize?: number;
  log?: (message: string) => void;
}

/**
 * `embed` stage: reads `catalog.json`, writes `vectors.bin`, `vector-ids.json`
 * and `embed-meta.json` (row order = catalog order).
 */
export async function runEmbed(
  buildDir: string,
  options: EmbedOptions,
): Promise<EmbedMeta> {
  const catalog = JSON.parse(
    await readFile(join(buildDir, "catalog.json"), "utf8"),
  ) as CatalogEntry[];
  const texts = catalog.map((e) =>
    documentText(e, options.enrichments?.get(e.id)),
  );
  const batchSize = options.batchSize ?? 32;
  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    vectors.push(
      ...(await options.embedder.embed(
        texts.slice(i, i + batchSize),
        "document",
      )),
    );
    options.log?.(
      `embed: ${String(Math.min(i + batchSize, texts.length))}/${String(texts.length)}`,
    );
  }
  const dims = vectors[0]?.length ?? 0;
  const quantisation = options.quantisation ?? "int8";
  const meta: EmbedMeta = {
    model: options.embedder.modelId,
    dims,
    quantisation,
    count: vectors.length,
  };
  await writeFile(
    join(buildDir, "vectors.bin"),
    encodeVectors(vectors, dims, quantisation),
  );
  await writeFile(
    join(buildDir, "vector-ids.json"),
    JSON.stringify(catalog.map((e) => e.id)) + "\n",
  );
  await writeFile(
    join(buildDir, EMBED_META_FILE),
    JSON.stringify(meta, null, 2) + "\n",
  );
  return meta;
}
