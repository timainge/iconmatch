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
