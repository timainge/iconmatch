/**
 * The single home of the embedding model's text conventions (spec §6.4).
 * The build (`embed` stage) and the runtime both import these, so document
 * and query text can't drift.
 */

/** Default embedding model (verified on the Hub; see DECISIONS.md). */
export const DEFAULT_EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";

/** Output dimensions of `DEFAULT_EMBEDDING_MODEL`. */
export const DEFAULT_EMBEDDING_DIMS = 384;

/** bge retrieval query instruction. Documents get no prefix. */
export const QUERY_PREFIX =
  "Represent this sentence for searching relevant passages: ";

/** Text actually sent to the model for a query or a document. */
export function embeddingInput(
  text: string,
  kind: "query" | "document",
): string {
  return kind === "query" ? QUERY_PREFIX + text : text;
}
