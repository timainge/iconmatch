export const SCHEMA_VERSION = 1;

export { VARIANT_NAMES } from "./types.js";
export type {
  CatalogEntry,
  Embedder,
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
