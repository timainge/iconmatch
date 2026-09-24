import type MiniSearch from "minisearch";
import { IconMatchCapabilityError } from "./errors.js";
import { letterFallback, type FallbackOptions } from "./fallback.js";
import type { KeywordDocument } from "./keyword-index.js";
import {
  createKeywordSearcher,
  KEYWORD_TOP_K,
  type KeywordHit,
} from "./keyword.js";
import { normaliseQuery } from "./query.js";
import { renderSvg, type RenderSvgOptions, type SvgProvider } from "./svg.js";
import type { CatalogEntry, IconMatch, VariantName } from "./types.js";
import { resolveVariant } from "./variant.js";

export { resolveVariant };

/** Parts `createIconMatcher` composes (spec §7.0 rule 3). Only `catalog` is required. */
export interface IconMatcherParts {
  catalog: CatalogEntry[];
  keywordIndex?: MiniSearch<KeywordDocument>;
  /** SVG bodies, e.g. `svgsFromArtifact(await loadSvgs(src))` or a remote fetch. */
  svgs?: SvgProvider;
  /** Include letter/number glyphs in ranked results. Default false (spec §7.2 step 8). */
  includeGlyphs?: boolean;
  /**
   * Below this top-result confidence, `best()` returns the lettered fallback.
   * Default `DEFAULT_MIN_CONFIDENCE` (provisional until chosen from the eval).
   */
  minConfidence?: number;
  fallbackShape?: FallbackOptions["fallbackShape"];
  fallbackIcon?: string;
}

export interface SearchOptions {
  /** Default 10. */
  limit?: number;
  /** Preferred variant; falls back to the icon's default. */
  variant?: VariantName;
}

export interface SvgOptions {
  /** Default 24. */
  size?: number;
  /** Outline variants only. */
  strokeWidth?: number;
  /** Requested variant; falls back to the icon's default. */
  variant?: VariantName;
  /** Accessible name; otherwise the SVG is `aria-hidden`. */
  title?: string;
}

export interface IconMatcher {
  search(query: string, options?: SearchOptions): Promise<IconMatch[]>;
  /** Top match, or the lettered fallback when confidence is below `minConfidence` (spec §7.4). */
  best(
    query: string,
    options?: Pick<SearchOptions, "variant">,
  ): Promise<IconMatch>;
  get(id: string): CatalogEntry | undefined;
  /** Rendered `<svg>` string (spec §7.6). Needs the `svgs` part. */
  svg(id: string, options?: SvgOptions): Promise<string>;
}

export const DEFAULT_LIMIT = 10;

/** Provisional; the default is chosen from the eval threshold sweep (spec §7.2 step 5, §9.3). */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

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
    async best(query, options = {}) {
      const [top] = await matcher.search(query, { ...options, limit: 1 });
      if (
        top &&
        top.confidence >= (parts.minConfidence ?? DEFAULT_MIN_CONFIDENCE)
      )
        return top;
      const fallback: FallbackOptions = {};
      if (parts.fallbackShape) fallback.fallbackShape = parts.fallbackShape;
      if (parts.fallbackIcon) fallback.fallbackIcon = parts.fallbackIcon;
      if (options.variant) fallback.variant = options.variant;
      return letterFallback(query, byId, fallback);
    },
    get: (id) => byId.get(id),
    async svg(id, options = {}) {
      if (!parts.svgs) throw new IconMatchCapabilityError("svg", "svgs");
      const entry = byId.get(id);
      if (!entry) throw new Error(`Unknown icon id: ${id}`);
      const variant = resolveVariant(entry, options.variant);
      const body = await parts.svgs.get(id, variant);
      const render: RenderSvgOptions = { variant };
      if (options.size !== undefined) render.size = options.size;
      if (options.strokeWidth !== undefined)
        render.strokeWidth = options.strokeWidth;
      if (options.title !== undefined) render.title = options.title;
      return renderSvg(body, render);
    },
  };
  return Promise.resolve(matcher);
}
