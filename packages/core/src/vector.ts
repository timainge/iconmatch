import type { VectorArtifact } from "./vectors.js";

export interface VectorHit {
  id: string;
  /** Cosine similarity to the query, -1..1. */
  cosine: number;
}

export interface VectorSearcher {
  readonly dims: number;
  /** Cosine similarity of every row to the query, in row order. */
  similarities(query: ArrayLike<number>): Float32Array;
  /** Best rows first (ties by id). `exclude` drops ids, e.g. glyphs. */
  search(
    query: ArrayLike<number>,
    options?: { limit?: number; exclude?: ReadonlySet<string> },
  ): VectorHit[];
}

/** Spec §7.2 step 3: vector search returns the top 50. */
export const VECTOR_TOP_K = 50;

/** Thrown when a query vector's length doesn't match the index. */
export class IconMatchDimensionError extends Error {
  override name = "IconMatchDimensionError";
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `Query vector has ${String(actual)} dims; the vector index has ${String(expected)}`,
    );
  }
}

/**
 * Brute-force cosine search over int8 or float32 rows (spec §7.2 step 3).
 * Row norms are precomputed, so int8 per-vector scales cancel out.
 */
export function createVectorSearcher(vectors: VectorArtifact): VectorSearcher {
  const { ids, dims, data } = vectors;
  const rows = ids.length;
  const norms = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let s = 0;
    for (let i = r * dims; i < (r + 1) * dims; i++) s += (data[i] ?? 0) ** 2;
    norms[r] = Math.sqrt(s);
  }

  const similarities = (query: ArrayLike<number>): Float32Array => {
    if (query.length !== dims)
      throw new IconMatchDimensionError(dims, query.length);
    let qn = 0;
    for (let i = 0; i < dims; i++) qn += (query[i] ?? 0) ** 2;
    qn = Math.sqrt(qn);
    const out = new Float32Array(rows);
    // A zero or non-finite query (e.g. NaN from a bad embedder) matches nothing.
    if (!Number.isFinite(qn) || qn === 0) return out;
    for (let r = 0; r < rows; r++) {
      let dot = 0;
      const base = r * dims;
      for (let i = 0; i < dims; i++)
        dot += (data[base + i] ?? 0) * (query[i] ?? 0);
      const denom = (norms[r] ?? 0) * qn;
      out[r] = denom === 0 ? 0 : dot / denom;
    }
    return out;
  };

  return {
    dims,
    similarities,
    search(query, options = {}) {
      const sims = similarities(query);
      const hits: VectorHit[] = [];
      ids.forEach((id, r) => {
        if (!options.exclude?.has(id)) hits.push({ id, cosine: sims[r] ?? 0 });
      });
      hits.sort(
        (a, b) =>
          b.cosine - a.cosine || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      return hits.slice(0, options.limit ?? VECTOR_TOP_K);
    },
  };
}
