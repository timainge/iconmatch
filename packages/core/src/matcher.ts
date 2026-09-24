import type MiniSearch from "minisearch";
import {
  IconMatchCapabilityError,
  IconMatchModelMismatchError,
} from "./errors.js";
import { letterFallback, type FallbackOptions } from "./fallback.js";
import type { KeywordDocument } from "./keyword-index.js";
import { fuse, hybridConfidence } from "./fuse.js";
import { createKeywordSearcher, KEYWORD_TOP_K } from "./keyword.js";
import { normaliseQuery } from "./query.js";
import { renderSvg, type RenderSvgOptions, type SvgProvider } from "./svg.js";
import type {
  CatalogEntry,
  Embedder,
  IconMatch,
  Manifest,
  VariantName,
} from "./types.js";
import {
  createVectorSearcher,
  IconMatchDimensionError,
  VECTOR_TOP_K,
} from "./vector.js";
import type { VectorArtifact } from "./vectors.js";
import { resolveVariant } from "./variant.js";

export { resolveVariant };

/** Parts `createIconMatcher` composes (spec §7.0 rule 3). Only `catalog` is required. */
export interface IconMatcherParts {
  catalog: CatalogEntry[];
  keywordIndex?: MiniSearch<KeywordDocument>;
  /** Icon vectors (`loadVectors`). With `embedder`, text search is hybrid. */
  vectors?: VectorArtifact;
  /** Embeds text queries. Lazy-loading embedders load on the first `search()`. */
  embedder?: Embedder;
  /** Checked against `embedder` and `vectors` (model, dims) at construction. */
  manifest?: Pick<Manifest, "embedding">;
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
  /**
   * Ranks icons against a precomputed query embedding (same model as the
   * index, query prefix applied). Needs `vectors`; never loads a model.
   */
  searchByEmbedding(
    vector: ArrayLike<number>,
    options?: SearchOptions,
  ): IconMatch[];
  get(id: string): CatalogEntry | undefined;
  /** Rendered `<svg>` string (spec §7.6). Needs the `svgs` part. */
  svg(id: string, options?: SvgOptions): Promise<string>;
}

export const DEFAULT_LIMIT = 10;

/** Provisional; the default is chosen from the eval threshold sweep (spec §7.2 step 5, §9.3). */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

function toMatch(
  entry: CatalogEntry,
  scored: {
    score: number;
    confidence: number;
    keyword: boolean;
    vector: boolean;
  },
  variant?: VariantName,
): IconMatch {
  return {
    id: entry.id,
    name: entry.name,
    label: entry.label,
    set: entry.set,
    score: scored.score,
    confidence: scored.confidence,
    variant: resolveVariant(entry, variant),
    availableVariants: [...entry.variants],
    matchedOn: { keyword: scored.keyword, vector: scored.vector },
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

/**
 * Construction-time checks (spec §7.1, §11.1 M2): the embedder must use the
 * model the vectors were built with, and dims must agree.
 */
function validateParts(parts: IconMatcherParts): Error | undefined {
  const embedding = parts.manifest?.embedding;
  const indexModel = embedding?.model ?? parts.vectors?.model;
  if (
    parts.embedder &&
    indexModel !== undefined &&
    parts.embedder.modelId !== indexModel
  ) {
    return new IconMatchModelMismatchError(indexModel, parts.embedder.modelId);
  }
  if (parts.vectors && embedding && parts.vectors.dims !== embedding.dims) {
    return new IconMatchDimensionError(embedding.dims, parts.vectors.dims);
  }
  return undefined;
}

export function createIconMatcher(
  parts: IconMatcherParts,
): Promise<IconMatcher> {
  const invalid = validateParts(parts);
  if (invalid) return Promise.reject(invalid);
  const byId = new Map(parts.catalog.map((e) => [e.id, e]));
  const includeGlyphs = parts.includeGlyphs ?? false;
  const glyphs = new Set(
    includeGlyphs ? [] : parts.catalog.filter((e) => e.glyph).map((e) => e.id),
  );
  const keyword = parts.keywordIndex
    ? createKeywordSearcher(parts.catalog, parts.keywordIndex)
    : undefined;
  const vector = parts.vectors
    ? createVectorSearcher(parts.vectors)
    : undefined;
  const rowOf = new Map(parts.vectors?.ids.map((id, r) => [id, r]));
  // Text queries reach vectors only through an embedder.
  const semantic =
    vector && parts.embedder ? { vector, embedder: parts.embedder } : undefined;

  const matcher: IconMatcher = {
    async search(query, options = {}) {
      if (!keyword && !semantic) {
        throw new IconMatchCapabilityError("search", "keywordIndex");
      }
      const limit = options.limit ?? DEFAULT_LIMIT;
      const keywordHits = keyword
        ? keyword.search(normaliseQuery(query), {
            limit: KEYWORD_TOP_K,
            includeGlyphs,
          })
        : [];
      let sims: Float32Array | undefined;
      let vectorIds: string[] = [];
      if (semantic && query.trim() !== "") {
        const [q] = await semantic.embedder.embed([query.trim()], "query");
        if (q) {
          sims = semantic.vector.similarities(q);
          vectorIds = semantic.vector
            .search(q, { limit: VECTOR_TOP_K, exclude: glyphs })
            .map((h) => h.id);
        }
      }

      const keywordById = new Map(keywordHits.map((h) => [h.id, h]));
      const inVector = new Set(vectorIds);
      const fused = fuse([
        { ids: keywordHits.map((h) => h.id) },
        { ids: vectorIds },
      ]);
      const matches = fused.flatMap(({ id, score }) => {
        const entry = byId.get(id);
        if (!entry) return [];
        const kw = keywordById.get(id);
        const row = rowOf.get(id);
        const confidence =
          sims && row !== undefined
            ? hybridConfidence(sims[row] ?? 0, kw !== undefined)
            : (kw?.confidence ?? 0);
        return [
          toMatch(
            entry,
            {
              score,
              confidence,
              keyword: kw !== undefined,
              vector: inVector.has(id),
            },
            options.variant,
          ),
        ];
      });
      return matches.sort(compareMatches(options.variant)).slice(0, limit);
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
    searchByEmbedding(queryVector, options = {}) {
      if (!vector)
        throw new IconMatchCapabilityError("searchByEmbedding", "vectors");
      const hits = vector.search(queryVector, {
        limit: VECTOR_TOP_K,
        exclude: glyphs,
      });
      const fused = new Map(
        fuse([{ ids: hits.map((h) => h.id) }]).map((h) => [h.id, h.score]),
      );
      return hits
        .flatMap((h) => {
          const entry = byId.get(h.id);
          const score = fused.get(h.id) ?? 0;
          const confidence = hybridConfidence(h.cosine, false);
          return entry
            ? [
                toMatch(
                  entry,
                  { score, confidence, keyword: false, vector: true },
                  options.variant,
                ),
              ]
            : [];
        })
        .sort(compareMatches(options.variant))
        .slice(0, options.limit ?? DEFAULT_LIMIT);
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
