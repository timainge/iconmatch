import type { CatalogEntry, VariantName } from "./types.js";

/** Renderable variant: the requested one if present, else the icon's default. */
export function resolveVariant(
  entry: CatalogEntry,
  requested?: VariantName,
): VariantName {
  if (requested && entry.variants.includes(requested)) return requested;
  return entry.variants[0] ?? "outline";
}
