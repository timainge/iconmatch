import MiniSearch, { type Options, type SearchOptions } from "minisearch";
import type { CatalogEntry } from "./types.js";

/**
 * Keyword index configuration shared by the build (`index` stage) and the
 * runtime loader. MiniSearch must be loaded with the same tokeniser and term
 * processing it was built with, so both sides import them from here.
 */

/** Optional enrichment text for an icon (spec §6.3). */
export interface KeywordEnrichment {
  concepts?: string[];
  description?: string;
}

/** One indexed document. Arrays are joined into space-separated text. */
export interface KeywordDocument {
  id: string;
  label: string;
  /** Name tokens: "arrow-bar-to-down" -> "arrow bar to down". */
  name: string;
  tags: string;
  categories: string;
  concepts: string;
  description: string;
}

/** Field boosts (spec §6.5 starting points; tune with the eval on `dev`). */
export const KEYWORD_BOOSTS: Readonly<
  Record<Exclude<keyof KeywordDocument, "id">, number>
> = {
  label: 3,
  name: 3,
  tags: 2,
  categories: 1,
  concepts: 1.5,
  description: 0.5,
};

export const KEYWORD_FIELDS = Object.keys(
  KEYWORD_BOOSTS,
) as (keyof typeof KEYWORD_BOOSTS)[];

/** Small English stopword list (spec §6.5). */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "its",
  "my",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "to",
  "with",
  "your",
]);

/** Splits on anything that isn't a lowercase letter or digit. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Plural folding (spec §6.5 minimum): "dogs" -> "dog", "berries" -> "berry",
 * "boxes" -> "box". Applied identically at build and query time, so an
 * over-folded word still matches itself.
 */
export function foldPlural(term: string): string {
  if (term.length <= 3 || /[0-9]/.test(term)) return term;
  if (term.endsWith("ies") && term.length > 4) return term.slice(0, -3) + "y";
  if (/(?:ss|sh|ch|x|z)es$/.test(term)) return term.slice(0, -2);
  if (term.endsWith("s") && !/(?:ss|us|is)$/.test(term))
    return term.slice(0, -1);
  return term;
}

/** Lowercase, drop stopwords and single letters, fold plurals. */
export function processTerm(term: string): string | null {
  const t = term.toLowerCase();
  if (STOPWORDS.has(t) || /^[a-z]$/.test(t)) return null;
  return foldPlural(t);
}

export const KEYWORD_INDEX_OPTIONS: Options<KeywordDocument> = {
  idField: "id",
  fields: KEYWORD_FIELDS,
  storeFields: [],
  tokenize,
  processTerm,
};

/**
 * Prefix for terms of 3+ chars; fuzzy (edit distance 1) for terms of 5+ chars.
 * Prefix weight 0.2 (MiniSearch default 0.375) so "dog" doesn't rank
 * "dogecoin" above tag matches; pre-eval starting point, tune on `dev`.
 */
export const KEYWORD_SEARCH_OPTIONS: SearchOptions = {
  boost: { ...KEYWORD_BOOSTS },
  weights: { fuzzy: 0.45, prefix: 0.2 },
  prefix: (term) => term.length >= 3,
  fuzzy: (term) => (term.length >= 5 ? 1 : false),
  combineWith: "OR",
};

export function keywordDocument(
  entry: CatalogEntry,
  enrichment: KeywordEnrichment = {},
): KeywordDocument {
  return {
    id: entry.id,
    label: entry.label,
    name: entry.name.replace(/-/g, " "),
    tags: entry.tags.join(" "),
    categories: entry.categories.join(" "),
    concepts: (enrichment.concepts ?? []).join(" "),
    description: enrichment.description ?? "",
  };
}

/** Builds the index over catalog order, so output is deterministic. */
export function buildKeywordIndex(
  catalog: CatalogEntry[],
  enrichments: ReadonlyMap<string, KeywordEnrichment> = new Map(),
): MiniSearch<KeywordDocument> {
  const index = new MiniSearch<KeywordDocument>({
    ...KEYWORD_INDEX_OPTIONS,
    searchOptions: KEYWORD_SEARCH_OPTIONS,
  });
  index.addAll(catalog.map((e) => keywordDocument(e, enrichments.get(e.id))));
  return index;
}

/** Restores a serialised index (`keyword-index.json`) with the shared options. */
export function parseKeywordIndex(json: string): MiniSearch<KeywordDocument> {
  return MiniSearch.loadJSON<KeywordDocument>(json, {
    ...KEYWORD_INDEX_OPTIONS,
    searchOptions: KEYWORD_SEARCH_OPTIONS,
  });
}
