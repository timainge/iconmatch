import type MiniSearch from "minisearch";
import {
  processTerm,
  tokenize,
  type KeywordDocument,
} from "./keyword-index.js";
import type { CatalogEntry } from "./types.js";

export interface KeywordHit {
  id: string;
  /** Raw MiniSearch (BM25) score. */
  score: number;
  /** 0..1, see `keywordConfidence`. */
  confidence: number;
}

export interface KeywordSearcher {
  /** Expects a normalised query (`normaliseQuery`). Returns best first. */
  search(
    query: string,
    options?: { limit?: number; includeGlyphs?: boolean },
  ): KeywordHit[];
}

/** Spec §7.2 step 2: keyword search returns the top 50. */
export const KEYWORD_TOP_K = 50;

/** Query terms as the index sees them (tokenised, stopwords dropped, plurals folded). */
export function queryTerms(query: string): string[] {
  return tokenize(query).flatMap((t) => processTerm(t) ?? []);
}

/**
 * Keyword-only confidence (spec §7.2 step 7): term coverage times score
 * relative to the top hit. A query term matched exactly counts 1, one matched
 * only by prefix or fuzzy counts 0.5. Tunable; choose with the eval on `dev`.
 */
export function keywordConfidence(
  hit: { score: number; terms: string[]; queryTerms: string[] },
  topScore: number,
  totalTerms: number,
): number {
  if (totalTerms === 0 || topScore <= 0) return 0;
  const matched = new Set(hit.queryTerms);
  let covered = 0;
  for (const t of matched) covered += hit.terms.includes(t) ? 1 : 0.5;
  return Math.min(1, covered / totalTerms) * (hit.score / topScore);
}

export function createKeywordSearcher(
  catalog: CatalogEntry[],
  index: MiniSearch<KeywordDocument>,
): KeywordSearcher {
  const glyphs = new Set(catalog.filter((e) => e.glyph).map((e) => e.id));
  return {
    search(query, options = {}) {
      const limit = options.limit ?? KEYWORD_TOP_K;
      const total = new Set(queryTerms(query)).size;
      const results = index
        .search(query)
        .filter(
          (r) => options.includeGlyphs === true || !glyphs.has(r.id as string),
        );
      const top = results[0]?.score ?? 0;
      return results.slice(0, limit).map((r) => ({
        id: r.id as string,
        score: r.score,
        confidence: keywordConfidence(r, top, total),
      }));
    },
  };
}
