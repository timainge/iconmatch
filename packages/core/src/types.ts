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

/** Turns text into vectors (spec §7.1). */
export interface Embedder {
  /** Must match `manifest.embedding.model`, or `createIconMatcher` throws. */
  modelId: string;
  embed(texts: string[], kind: "query" | "document"): Promise<Float32Array[]>;
}
