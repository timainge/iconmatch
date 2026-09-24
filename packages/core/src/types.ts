/** Turns text into vectors (spec §7.1). */
export interface Embedder {
  /** Must match `manifest.embedding.model`, or `createIconMatcher` throws. */
  modelId: string;
  embed(texts: string[], kind: "query" | "document"): Promise<Float32Array[]>;
}
