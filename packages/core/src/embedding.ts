/**
 * The single home of the embedding models' text conventions (spec §6.4,
 * §15.3). The build (`embed` stage) and the runtime both import these, so
 * document and query text, and pooling, can't drift.
 */

/** How a model's token embeddings become one vector (from its model card). */
export type Pooling = "mean" | "cls";

/** One embedding model's conventions (spec §15.3). */
export interface EmbeddingProfile {
  /** Hub id, also the Embedder `modelId` and `manifest.embedding.model`. */
  model: string;
  dims: number;
  pooling: Pooling;
  /** Prepended to query text. */
  queryPrefix: string;
  /** Prepended to document (icon) text. */
  documentPrefix: string;
}

/** bge retrieval query instruction, also used by Snowflake's arctic-embed. */
export const QUERY_PREFIX =
  "Represent this sentence for searching relevant passages: ";

const profile = (
  model: string,
  dims: number,
  pooling: Pooling,
  queryPrefix = "",
  documentPrefix = "",
): EmbeddingProfile => ({ model, dims, pooling, queryPrefix, documentPrefix });

/**
 * Models with verified conventions (pooling from each model's
 * sentence-transformers config, prefixes from its card; see DECISIONS.md).
 */
export const EMBEDDING_PROFILES: readonly EmbeddingProfile[] = [
  profile("Xenova/bge-small-en-v1.5", 384, "mean", QUERY_PREFIX),
  profile("Xenova/bge-base-en-v1.5", 768, "mean", QUERY_PREFIX),
  profile("Xenova/bge-large-en-v1.5", 1024, "mean", QUERY_PREFIX),
  profile("Xenova/gte-small", 384, "mean"),
  profile("Xenova/gte-base", 768, "mean"),
  profile("Xenova/all-MiniLM-L6-v2", 384, "mean"),
  profile("mixedbread-ai/mxbai-embed-xsmall-v1", 384, "mean"),
  profile("Snowflake/snowflake-arctic-embed-xs", 384, "cls", QUERY_PREFIX),
  profile("Snowflake/snowflake-arctic-embed-s", 384, "cls", QUERY_PREFIX),
  profile("Snowflake/snowflake-arctic-embed-m-v1.5", 768, "cls", QUERY_PREFIX),
  profile(
    "nomic-ai/nomic-embed-text-v1.5",
    768,
    "mean",
    "search_query: ",
    "search_document: ",
  ),
];

/** The registered profile for a model id, or undefined. */
export function findEmbeddingProfile(
  model: string,
): EmbeddingProfile | undefined {
  return EMBEDDING_PROFILES.find((p) => p.model === model);
}

/** Default embedding model (verified on the Hub; see DECISIONS.md). */
export const DEFAULT_EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";

/** Profile of `DEFAULT_EMBEDDING_MODEL`. */
export const DEFAULT_EMBEDDING_PROFILE: EmbeddingProfile =
  EMBEDDING_PROFILES[0] ??
  profile(DEFAULT_EMBEDDING_MODEL, 384, "mean", QUERY_PREFIX);

/** Output dimensions of `DEFAULT_EMBEDDING_MODEL`. */
export const DEFAULT_EMBEDDING_DIMS = DEFAULT_EMBEDDING_PROFILE.dims;

/** Text actually sent to the model for a query or a document. */
export function embeddingInput(
  text: string,
  kind: "query" | "document",
  conventions: Pick<
    EmbeddingProfile,
    "queryPrefix" | "documentPrefix"
  > = DEFAULT_EMBEDDING_PROFILE,
): string {
  return (
    (kind === "query" ? conventions.queryPrefix : conventions.documentPrefix) +
    text
  );
}
