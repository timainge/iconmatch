import type MiniSearch from "minisearch";
import { IconMatchCapabilityError } from "./errors.js";
import type { KeywordDocument } from "./keyword-index.js";
import {
  createKeywordSearcher,
  KEYWORD_TOP_K,
  type KeywordHit,
} from "./keyword.js";
import { normaliseQuery } from "./query.js";
import type { CatalogEntry, IconMatch, VariantName } from "./types.js";

/** Parts `createIconMatcher` composes (spec §7.0 rule 3). Only `catalog` is required. */
export interface IconMatcherParts {
  catalog: CatalogEntry[];
  keywordIndex?: MiniSearch<KeywordDocument>;
  /** Include letter/number glyphs in ranked results. Default false (spec §7.2 step 8). */
  includeGlyphs?: boolean;
}

export interface SearchOptions {
  /** Default 10. */
  limit?: number;
  /** Preferred variant; falls back to the icon's default. */
  variant?: VariantName;
}

export interface IconMatcher {
  search(query: string, options?: SearchOptions): Promise<IconMatch[]>;
  get(id: string): CatalogEntry | undefined;
}

export const DEFAULT_LIMIT = 10;

/** Renderable variant: the requested one if present, else the icon's default. */
export function resolveVariant(
  entry: CatalogEntry,
  requested?: VariantName,
): VariantName {
  if (requested && entry.variants.includes(requested)) return requested;
  return entry.variants[0] ?? "outline";
}

function toMatch(
  entry: CatalogEntry,
  hit: KeywordHit,
  variant?: VariantName,
): IconMatch {
  return {
    id: entry.id,
    name: entry.name,
    label: entry.label,
    set: entry.set,
    score: hit.score,
    confidence: hit.confidence,
    variant: resolveVariant(entry, variant),
    availableVariants: [...entry.variants],
    matchedOn: { keyword: true, vector: false },
  };
}

/**
 * Spec §7.2 step 6: by score, then icons that have the requested variant,
 * then shorter (more generic) names, then id for determinism.
 */
export function compareMatches(requested?: VariantName) {
  const has = (m: IconMatch) =>
    requested && m.availableVariants.includes(requested) ? 0 : 1;
  return (a: IconMatch, b: IconMatch): number =>
    b.score - a.score ||
    has(a) - has(b) ||
    a.name.length - b.name.length ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function createIconMatcher(
  parts: IconMatcherParts,
): Promise<IconMatcher> {
  const byId = new Map(parts.catalog.map((e) => [e.id, e]));
  const keyword = parts.keywordIndex
    ? createKeywordSearcher(parts.catalog, parts.keywordIndex)
    : undefined;

  const matcher: IconMatcher = {
    search(query, options = {}) {
      if (!keyword)
        return Promise.reject(
          new IconMatchCapabilityError("search", "keywordIndex"),
        );
      const limit = options.limit ?? DEFAULT_LIMIT;
      const hits = keyword.search(normaliseQuery(query), {
        limit: KEYWORD_TOP_K,
        includeGlyphs: parts.includeGlyphs ?? false,
      });
      const matches = hits.flatMap((h) => {
        const entry = byId.get(h.id);
        return entry ? [toMatch(entry, h, options.variant)] : [];
      });
      return Promise.resolve(
        matches.sort(compareMatches(options.variant)).slice(0, limit),
      );
    },
    get: (id) => byId.get(id),
  };
  return Promise.resolve(matcher);
}
