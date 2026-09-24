/** RRF constant (spec §7.2 step 4). */
export const RRF_K = 60;

/** Confidence bump for icons that also matched on keyword (spec §7.2 step 5). */
export const KEYWORD_CONFIDENCE_BUMP = 0.1;

export interface Ranking {
  /** Ids, best first. */
  ids: readonly string[];
  /** Multiplier for this ranking's contribution. Default 1. */
  weight?: number;
}

export interface FusedHit {
  id: string;
  score: number;
}

/**
 * Reciprocal Rank Fusion: `score = Σ weight / (k + rank)`, rank starting at 1.
 * Returns best first, ties by id.
 */
export function fuse(
  rankings: readonly Ranking[],
  options: { k?: number } = {},
): FusedHit[] {
  const k = options.k ?? RRF_K;
  const scores = new Map<string, number>();
  for (const { ids, weight = 1 } of rankings) {
    ids.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + i + 1));
    });
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort(
      (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Hybrid confidence (spec §7.2 step 5): the icon's cosine similarity to the
 * query, bumped when it also matched on keyword. Clamped to 0..1. Tunable;
 * choose the default `minConfidence` with the eval.
 */
export function hybridConfidence(
  cosine: number,
  keywordMatched: boolean,
): number {
  const c = cosine + (keywordMatched ? KEYWORD_CONFIDENCE_BUMP : 0);
  return Math.min(1, Math.max(0, c));
}
