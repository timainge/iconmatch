/** Visual variants an icon set may offer (spec §6.1). v1 ships outline only. */
export const VARIANT_NAMES = [
  "outline",
  "filled",
  "thin",
  "light",
  "bold",
  "duotone",
] as const;

export type VariantName = (typeof VARIANT_NAMES)[number];

/** One icon concept in `catalog.json` (spec §6.2). JSON-safe wire type. */
export interface CatalogEntry {
  /** `<set>:<name>`, e.g. "tabler:heart". */
  id: string;
  set: string;
  /** Base concept name, kebab-case, without variant suffix. */
  name: string;
  /** Humanised name, e.g. "Heart". */
  label: string;
  tags: string[];
  categories: string[];
  /** Variants that exist for this icon (v1: ["outline"]). */
  variants: VariantName[];
  /** SPDX licence id. */
  license: string;
  /** Depicts a third-party trademark. */
  brand?: boolean;
  /** Letter/number glyphs, used by the lettered fallback (spec §7.4). */
  glyph?: "letter" | "number";
}

/** One variant's SVG inner markup plus its viewBox size. JSON-safe wire type. */
export interface SvgBody {
  body: string;
  width: number;
  height: number;
}

/** Contents of `svgs.json`: icon id, then variant (spec §6.2). */
export type SvgArtifact = Record<string, Partial<Record<VariantName, SvgBody>>>;

/** Turns text into vectors (spec §7.1). */
export interface Embedder {
  /** Must match `manifest.embedding.model`, or `createIconMatcher` throws. */
  modelId: string;
  embed(texts: string[], kind: "query" | "document"): Promise<Float32Array[]>;
}

/** Artifact file names inside a data directory (spec §6.6). */
export interface ManifestFiles {
  catalog: string;
  svgs: string;
  vectors: string;
  vectorIds: string;
  keywordIndex: string;
}

/** `manifest.json` (spec §6.6). */
export interface Manifest {
  schemaVersion: number;
  builtAt: string;
  sets: {
    id: string;
    version: string;
    license: string;
    count: number;
    /** The licence requires visible attribution (spec §8). */
    attributionRequired?: boolean;
    /** Licence URL, for attribution UIs. */
    url?: string;
  }[];
  embedding?: {
    model: string;
    dims: number;
    quantisation: "int8" | "float32";
    queryPrefix: string;
  };
  enrichment?: {
    mode: "text" | "vision" | "none";
    model?: string;
    promptVersion?: string;
  };
  files: ManifestFiles;
}

/** One ranked search result (spec §7.1). JSON-safe wire type. */
export interface IconMatch {
  id: string;
  name: string;
  label: string;
  set: string;
  /** Fused score, for ranking only. */
  score: number;
  /** 0..1 (spec §7.2); use this for thresholds. */
  confidence: number;
  /** Variant that will be rendered (after fallback). */
  variant: VariantName;
  availableVariants: VariantName[];
  matchedOn: { keyword: boolean; vector: boolean; remote?: boolean };
  isFallback?: boolean;
  /** Set when isFallback: the character the glyph shows. */
  fallbackLetter?: string;
}

/** A set the consuming app must credit (spec §8, `matcher.attributions()`). */
export interface Attribution {
  set: string;
  license: string;
  url?: string;
}
