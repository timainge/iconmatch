export {
  assertSafeFileName,
  fetchSource,
  IconMatchDataError,
  memorySource,
} from "./data/source.js";
export type { DataSource, FetchSourceOptions } from "./data/source.js";
export {
  DEFAULT_FILES,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  MANIFEST_FILE,
  SCHEMA_VERSION,
} from "./data/loaders.js";
export type { LoadOptions } from "./data/loaders.js";

export { VARIANT_NAMES } from "./types.js";
export type {
  CatalogEntry,
  Embedder,
  IconMatch,
  Manifest,
  ManifestFiles,
  SvgArtifact,
  SvgBody,
  VariantName,
} from "./types.js";

export {
  buildKeywordIndex,
  foldPlural,
  KEYWORD_BOOSTS,
  KEYWORD_FIELDS,
  KEYWORD_INDEX_OPTIONS,
  KEYWORD_SEARCH_OPTIONS,
  keywordDocument,
  parseKeywordIndex,
  processTerm,
  STOPWORDS,
  tokenize,
} from "./keyword-index.js";
export type { KeywordDocument, KeywordEnrichment } from "./keyword-index.js";

export { IconMatchCapabilityError } from "./errors.js";
export { normaliseQuery } from "./query.js";
export {
  createKeywordSearcher,
  KEYWORD_TOP_K,
  keywordConfidence,
  queryTerms,
} from "./keyword.js";
export type { KeywordHit, KeywordSearcher } from "./keyword.js";
export {
  compareMatches,
  createIconMatcher,
  DEFAULT_LIMIT,
  DEFAULT_MIN_CONFIDENCE,
  resolveVariant,
} from "./matcher.js";
export type {
  IconMatcher,
  IconMatcherParts,
  SearchOptions,
} from "./matcher.js";
export {
  DEFAULT_FALLBACK_ICON,
  fallbackCharacter,
  glyphId,
  letterFallback,
} from "./fallback.js";
export type { FallbackOptions } from "./fallback.js";
export {
  DEFAULT_EMBEDDING_DIMS,
  DEFAULT_EMBEDDING_MODEL,
  embeddingInput,
  QUERY_PREFIX,
} from "./embedding.js";
