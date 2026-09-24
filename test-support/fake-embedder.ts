import type { Embedder } from "../packages/core/src/types.js";

export interface FakeEmbedderOptions {
  modelId?: string;
  dims?: number;
}

export interface FakeEmbedder extends Embedder {
  readonly dims: number;
  /** Every `embed` call, in order, for asserting when (and whether) embedding ran. */
  readonly calls: { texts: string[]; kind: "query" | "document" }[];
}

export const FAKE_MODEL_ID = "fake/hash-embedder";

/**
 * Deterministic stand-in for the real model (spec §10). Each lowercase
 * alphanumeric token hashes to a signed unit in one dimension, and the sum is
 * L2-normalised, so texts sharing words have higher cosine than unrelated
 * ones. No model, no network, stable across runs and platforms.
 */
export function createFakeEmbedder(
  options: FakeEmbedderOptions = {},
): FakeEmbedder {
  const dims = options.dims ?? 384;
  const calls: FakeEmbedder["calls"] = [];
  return {
    modelId: options.modelId ?? FAKE_MODEL_ID,
    dims,
    calls,
    embed(texts, kind) {
      calls.push({ texts: [...texts], kind });
      return Promise.resolve(texts.map((t) => embedOne(t, dims)));
    },
  };
}

function embedOne(text: string, dims: number): Float32Array {
  const v = new Float32Array(dims);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  // Text with no tokens still gets a stable, non-zero vector.
  for (const token of tokens.length > 0 ? tokens : [`\u0000${text}`]) {
    const h = fnv1a(token);
    const sign = (h & 1) === 0 ? 1 : -1;
    v[(h >>> 1) % dims] = (v[(h >>> 1) % dims] ?? 0) + sign;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  // Opposite-signed hash collisions can cancel out; never return a zero vector.
  if (norm === 0) {
    v[fnv1a(text) % dims] = 1;
    return v;
  }
  for (let i = 0; i < dims; i++) v[i] = (v[i] ?? 0) / norm;
  return v;
}

/** 32-bit FNV-1a over UTF-16 code units. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
