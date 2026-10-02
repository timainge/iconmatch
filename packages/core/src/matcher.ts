import type MiniSearch from "minisearch";
import type { ChoiceMemory } from "./choices.js";
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
  Attribution,
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
  /**
   * Server-side search (e.g. hybrid on a server with the model). Used in
   * place of local vector search; on rejection or timeout, `search()` falls
   * back to local keyword results (spec §7.0).
   */
  remoteSearch?: RemoteSearch;
  /** Longest wait for `remoteSearch`. Default `DEFAULT_REMOTE_TIMEOUT_MS`. */
  remoteTimeoutMs?: number;
  /** Called when `remoteSearch` rejects or times out. */
  onRemoteError?: (error: unknown) => void;
  /**
   * Optional query expansion (spec §7.3), e.g. an LLM returning 2–3 concrete
   * objects for an abstract label. The library ships no LLM. Each icon keeps
   * its best confidence over the query texts, so expansion raises confidences:
   * pair it with a higher `minConfidence` (0.70 on the eval's tuning split).
   */
  expandQuery?: (query: string) => Promise<string[]>;
  /** Called when `expandQuery` rejects; search continues without expansions. */
  onExpandError?: (error: unknown) => void;
  /**
   * Remembered user choices (spec §15.4), e.g. `createChoiceMemory(saved)`.
   * An exact repeat of a query returns its chosen icon first; with an
   * embedder, choices made for similar queries also rank higher.
   */
  choices?: ChoiceMemory;
  /**
   * Minimum query-to-query cosine for a past choice to count as similar.
   * Default `DEFAULT_CHOICE_SIMILARITY`.
   */
  choiceSimilarity?: number;
  /**
   * Checked against `embedder` and `vectors` (model, dims) at construction;
   * its `sets` feed `attributions()`.
   */
  manifest?: Pick<Manifest, "embedding"> & Partial<Pick<Manifest, "sets">>;
  /** SVG bodies, e.g. `svgsFromArtifact(await loadSvgs(src))` or a remote fetch. */
  svgs?: SvgProvider;
  /** Include letter/number glyphs in ranked results. Default false (spec §7.2 step 8). */
  includeGlyphs?: boolean;
  /**
   * Below this top-result confidence, `best()` returns the lettered fallback,
   * when semantic ranking (vectors or remote search) took part.
   * Default `DEFAULT_MIN_CONFIDENCE`, chosen from the eval (spec §9.3).
   */
  minConfidence?: number;
  /**
   * Threshold for searches that ran keyword-only (no embedder/vectors, or
   * remote search failed). Keyword confidence is on a different scale.
   * Default `DEFAULT_KEYWORD_MIN_CONFIDENCE`.
   */
  keywordMinConfidence?: number;
  fallbackShape?: FallbackOptions["fallbackShape"];
  /**
   * Neutral fallback glyph id. Default: the manifest's first set's
   * `fallbackIcon` when a `manifest` part is given, else `DEFAULT_FALLBACK_ICON`.
   */
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
  /** Sets whose licence requires visible attribution (spec §8). Needs the `manifest` part. */
  attributions(): Attribution[];
  /** Rendered `<svg>` string (spec §7.6). Needs the `svgs` part. */
  svg(id: string, options?: SvgOptions): Promise<string>;
  /**
   * Remembers that the user picked `iconId` for `query` (spec §15.4). Needs
   * the `choices` part; embeds the query when an embedder is present.
   */
  recordChoice(query: string, iconId: string): Promise<void>;
}

export const DEFAULT_LIMIT = 10;

/** RRF weight of the original query when expansions are fused (spec §7.3). */
export const EXPANSION_ORIGINAL_WEIGHT = 2;

/**
 * Default `choiceSimilarity`: past queries at least this similar (embedding
 * cosine) lend their chosen icon a ranking. Chosen on dev in the choice eval
 * (`eval/choices/`, spec §15.4): the best paraphrase gain whose unseen
 * queries lose at most 0.02 Hit@3/MRR. Measured with bge-small.
 */
export const DEFAULT_CHOICE_SIMILARITY = 0.7;

/** RRF weight of the ranking built from similar past choices. */
export const CHOICE_RANK_WEIGHT = 2;

interface Candidate {
  confidence: number;
  keyword: boolean;
  vector: boolean;
  remote?: IconMatch;
}

function mergeCandidates(a: Candidate, b: Candidate): Candidate {
  const merged: Candidate = {
    confidence: Math.max(a.confidence, b.confidence),
    keyword: a.keyword || b.keyword,
    vector: a.vector || b.vector,
  };
  const remote = a.remote ?? b.remote;
  if (remote) merged.remote = remote;
  return merged;
}

interface QueryRanking {
  rankings: string[][];
  candidates: Map<string, Candidate>;
  remoteUsed: boolean;
  /** Vectors or remote search contributed a ranking. */
  semantic: boolean;
  /** The query's embedding, when local vectors ranked it. */
  queryVector?: Float32Array;
  /** Confidence of any icon for this query text, when local vectors scored every row. */
  confidenceOf?: (id: string) => number;
}

/** Default `remoteTimeoutMs`. */
export const DEFAULT_REMOTE_TIMEOUT_MS = 1500;

/** Ranked results from a server; `signal` aborts when the matcher stops waiting. */
export type RemoteSearch = (
  query: string,
  options: { limit: number; signal: AbortSignal },
) => Promise<IconMatch[]>;

/** Thrown (and passed to `onRemoteError`) when `remoteSearch` exceeds its timeout. */
export class IconMatchTimeoutError extends Error {
  override name = "IconMatchTimeoutError";
  constructor(readonly timeoutMs: number) {
    super(`remoteSearch did not answer within ${String(timeoutMs)} ms`);
  }
}

/** Runs `task`, rejecting with IconMatchTimeoutError (and aborting it) after `ms`. */
function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new IconMatchTimeoutError(ms);
      controller.abort(error);
      reject(error);
    }, ms);
    task(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Chosen from the reviewed eval's dev sweep (spec §7.2 step 5, §9.3): the
 * hybrid threshold with the best fallback F1 on eval v2 (see DECISIONS.md).
 */
export const DEFAULT_MIN_CONFIDENCE = 0.65;

/** Keyword-only counterpart of `DEFAULT_MIN_CONFIDENCE`, from the same sweep. */
export const DEFAULT_KEYWORD_MIN_CONFIDENCE = 0.5;

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

  /** Keyword + (remote or vector) rankings and per-icon evidence for one query text. */
  async function rankQuery(query: string): Promise<QueryRanking> {
    const keywordHits = keyword
      ? keyword.search(normaliseQuery(query), {
          limit: KEYWORD_TOP_K,
          includeGlyphs,
        })
      : [];
    const keywordById = new Map(keywordHits.map((h) => [h.id, h]));

    // The second ranking: remote search in place of local vectors (spec §7.0).
    let remote: Map<string, IconMatch> | undefined;
    let sims: Float32Array | undefined;
    let queryVector: Float32Array | undefined;
    let secondIds: string[] = [];
    if (parts.remoteSearch) {
      try {
        const results = await withTimeout(
          (signal) =>
            parts.remoteSearch?.(query, { limit: KEYWORD_TOP_K, signal }) ??
            Promise.resolve([]),
          parts.remoteTimeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS,
        );
        remote = new Map(
          results
            .filter((r) => !r.isFallback && !glyphs.has(r.id))
            .map((r) => [r.id, r]),
        );
        secondIds = [...remote.keys()];
      } catch (error) {
        parts.onRemoteError?.(error);
        if (!keyword) throw error;
      }
    } else if (semantic) {
      const [q] = await semantic.embedder.embed([query.trim()], "query");
      queryVector = q;
      if (q) {
        sims = semantic.vector.similarities(q);
        secondIds = semantic.vector
          .search(q, { limit: VECTOR_TOP_K, exclude: glyphs })
          .map((h) => h.id);
      }
    }

    const inSecond = new Set(secondIds);
    const candidates = new Map<string, Candidate>();
    for (const id of new Set([...keywordHits.map((h) => h.id), ...secondIds])) {
      const kw = keywordById.get(id);
      const r = remote?.get(id);
      const row = rowOf.get(id);
      const confidence = r
        ? Math.max(r.confidence, kw?.confidence ?? 0)
        : sims && row !== undefined
          ? // Only a source-field keyword hit earns the bump (spec §6.3:
            // enrichment is supplementary).
            hybridConfidence(sims[row] ?? 0, kw?.sourceMatch === true)
          : (kw?.confidence ?? 0);
      const c: Candidate = {
        confidence,
        keyword: kw !== undefined,
        vector: r ? r.matchedOn.vector : inSecond.has(id),
      };
      if (r) c.remote = r;
      candidates.set(id, c);
    }
    const allSims = sims;
    return {
      rankings: [keywordHits.map((h) => h.id), secondIds],
      candidates,
      remoteUsed: remote !== undefined,
      semantic: sims !== undefined || remote !== undefined,
      ...(queryVector && { queryVector }),
      ...(allSims && {
        confidenceOf: (id: string) => {
          const row = rowOf.get(id);
          return row === undefined
            ? 0
            : hybridConfidence(
                allSims[row] ?? 0,
                keywordById.get(id)?.sourceMatch === true,
              );
        },
      }),
    };
  }

  async function searchDetailed(
    query: string,
    options: SearchOptions,
  ): Promise<{ matches: IconMatch[]; semantic: boolean }> {
    if (!keyword && !semantic && !parts.remoteSearch) {
      throw new IconMatchCapabilityError("search", "keywordIndex");
    }
    const limit = options.limit ?? DEFAULT_LIMIT;
    // No letters or digits: nothing to match, and nothing worth embedding.
    if (normaliseQuery(query) === "") return { matches: [], semantic: false };

    // Query expansion (spec §7.3): the original plus each expansion, the
    // original weighted ×2 in the fusion. A failing expander is ignored.
    const expansions = parts.expandQuery
      ? (
          await parts.expandQuery(query).catch((error: unknown) => {
            parts.onExpandError?.(error);
            return [];
          })
        )
          .map((q) => q.trim())
          .filter(
            (q) => q !== "" && q.toLowerCase() !== query.trim().toLowerCase(),
          )
      : [];
    const ranked = [
      {
        weight: expansions.length > 0 ? EXPANSION_ORIGINAL_WEIGHT : 1,
        result: await rankQuery(query),
      },
      ...(await Promise.all(
        expansions.map(async (q) => ({
          weight: 1,
          result: await rankQuery(q),
        })),
      )),
    ];

    // Choice learning (spec §15.4): exact repeats come first; similar past
    // queries' choices join the fusion as one more ranking.
    const original = ranked[0]?.result;
    const usable = (id: string) => byId.has(id) && !glyphs.has(id);
    const exactIds = parts.choices
      ? [
          ...new Set(
            parts.choices
              .exact(normaliseQuery(query))
              .map((e) => e.iconId)
              .filter(usable),
          ),
        ]
      : [];
    const similarIds =
      parts.choices && original?.queryVector && semantic
        ? parts.choices
            .similar(
              original.queryVector,
              semantic.embedder.modelId,
              parts.choiceSimilarity ?? DEFAULT_CHOICE_SIMILARITY,
            )
            .map((e) => e.iconId)
            .filter((id) => usable(id) && !exactIds.includes(id))
        : [];
    const chosen = new Set([...exactIds, ...similarIds]);

    const fused = fuse([
      ...ranked.flatMap(({ weight, result }) =>
        result.rankings.map((ids) => ({ ids, weight })),
      ),
      ...(similarIds.length > 0
        ? [{ ids: similarIds, weight: CHOICE_RANK_WEIGHT }]
        : []),
    ]);
    const remoteUsed = ranked.some(({ result }) => result.remoteUsed);
    const matches = fused.flatMap(({ id, score }) => {
      let hit: Candidate | undefined;
      for (const { result } of ranked) {
        const c = result.candidates.get(id);
        if (!c) continue;
        hit = hit ? mergeCandidates(hit, c) : c;
      }
      if (!hit && chosen.has(id))
        hit = {
          confidence: original?.confidenceOf?.(id) ?? 0,
          keyword: false,
          vector: false,
        };
      if (!hit) return [];
      const entry = byId.get(id);
      if (!entry) {
        // A remote-only icon unknown to this catalog: trust the server's fields.
        const r = hit.remote;
        return r
          ? [
              {
                ...r,
                score,
                matchedOn: {
                  keyword: false,
                  vector: r.matchedOn.vector,
                  remote: true,
                },
              },
            ]
          : [];
      }
      const match = toMatch(
        entry,
        {
          score,
          confidence: hit.confidence,
          keyword: hit.keyword,
          vector: hit.vector,
        },
        options.variant,
      );
      if (remoteUsed) match.matchedOn.remote = hit.remote !== undefined;
      if (chosen.has(id)) match.matchedOn.choice = true;
      return [match];
    });
    matches.sort(compareMatches(options.variant));
    // An exact repeat returns the remembered icon(s) first, latest choice
    // first, at full confidence, so best() never falls back on it.
    const promoted = exactIds.flatMap((id): IconMatch[] => {
      const entry = byId.get(id);
      if (!entry) return [];
      const existing = matches.find((m) => m.id === id);
      const match =
        existing ??
        toMatch(
          entry,
          { score: 0, confidence: 1, keyword: false, vector: false },
          options.variant,
        );
      match.confidence = 1;
      match.matchedOn.choice = true;
      return [match];
    });
    const rest = matches.filter((m) => !exactIds.includes(m.id));
    return {
      matches: [...promoted, ...rest].slice(0, limit),
      semantic:
        ranked.some(({ result }) => result.semantic) || promoted.length > 0,
    };
  }

  const matcher: IconMatcher = {
    async search(query, options = {}) {
      return (await searchDetailed(query, options)).matches;
    },
    async best(query, options = {}) {
      const { matches, semantic } = await searchDetailed(query, {
        ...options,
        limit: 1,
      });
      const [top] = matches;
      const threshold = semantic
        ? (parts.minConfidence ?? DEFAULT_MIN_CONFIDENCE)
        : (parts.keywordMinConfidence ?? DEFAULT_KEYWORD_MIN_CONFIDENCE);
      if (top && top.confidence >= threshold) return top;
      const fallback: FallbackOptions = {};
      if (parts.fallbackShape) fallback.fallbackShape = parts.fallbackShape;
      const fallbackIcon =
        parts.fallbackIcon ?? parts.manifest?.sets?.[0]?.fallbackIcon;
      if (fallbackIcon) fallback.fallbackIcon = fallbackIcon;
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
    attributions() {
      if (!parts.manifest?.sets)
        throw new IconMatchCapabilityError("attributions", "manifest");
      return parts.manifest.sets
        .filter((s) => s.attributionRequired === true)
        .map((s) =>
          s.url === undefined
            ? { set: s.id, license: s.license }
            : { set: s.id, license: s.license, url: s.url },
        );
    },
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
    async recordChoice(query, iconId) {
      if (!parts.choices)
        throw new IconMatchCapabilityError("recordChoice", "choices");
      if (!byId.has(iconId)) throw new Error(`Unknown icon id ${iconId}`);
      const normalised = normaliseQuery(query);
      if (normalised === "") return;
      const [vector] = semantic
        ? await semantic.embedder.embed([query.trim()], "query")
        : [];
      parts.choices.record({
        query: normalised,
        iconId,
        ...(vector && semantic && { vector, model: semantic.embedder.modelId }),
      });
    },
  };
  return Promise.resolve(matcher);
}
