import { resolveVariant } from "./variant.js";
import type { CatalogEntry, IconMatch, VariantName } from "./types.js";

export interface FallbackOptions {
  /** Frame of the letter/number glyph. Default "square". */
  fallbackShape?: "square" | "circle";
  /** Neutral glyph when there is no usable character. Default "tabler:category". */
  fallbackIcon?: string;
  /** Preferred variant; falls back to the glyph's default. */
  variant?: VariantName;
}

export const DEFAULT_FALLBACK_ICON = "tabler:category";

/**
 * First letter or digit of a label after NFKD normalisation with diacritics
 * stripped, lowercased ("Écoles" -> "e", "2024 taxes" -> "2"). Undefined when
 * the label has none.
 */
export function fallbackCharacter(label: string): string | undefined {
  const plain = label.normalize("NFKD").replace(/\p{M}/gu, "");
  return /[\p{L}\p{N}]/u.exec(plain)?.[0].toLowerCase();
}

/** Glyph id for a character, e.g. "tabler:square-letter-m"; undefined outside a-z/0-9. */
export function glyphId(
  set: string,
  char: string,
  shape: "square" | "circle",
): string | undefined {
  if (/^[a-z]$/.test(char)) return `${set}:${shape}-letter-${char}`;
  if (/^[0-9]$/.test(char)) return `${set}:${shape}-number-${char}`;
  return undefined;
}

function isMap(
  c: readonly CatalogEntry[] | ReadonlyMap<string, CatalogEntry>,
): c is ReadonlyMap<string, CatalogEntry> {
  return c instanceof Map;
}

/**
 * Lettered fallback glyph for a label (spec §7.4), from the set of
 * `fallbackIcon` so it matches the style. Uses the neutral `fallbackIcon`
 * when the label has no usable character or the glyph is missing.
 * `fallbackLetter` is set only when the glyph shows that character.
 */
export function letterFallback(
  label: string,
  catalog: readonly CatalogEntry[] | ReadonlyMap<string, CatalogEntry>,
  options: FallbackOptions = {},
): IconMatch {
  const byId = isMap(catalog)
    ? catalog
    : new Map(catalog.map((e) => [e.id, e]));
  const neutralId = options.fallbackIcon ?? DEFAULT_FALLBACK_ICON;
  const set = neutralId.split(":")[0] ?? "";
  const char = fallbackCharacter(label);
  const id =
    char === undefined
      ? undefined
      : glyphId(set, char, options.fallbackShape ?? "square");
  const glyph = id === undefined ? undefined : byId.get(id);
  const entry = glyph ?? byId.get(neutralId);
  if (!entry) {
    throw new Error(
      `Fallback icon ${neutralId} is not in the catalog; set fallbackIcon to an existing id`,
    );
  }
  const match: IconMatch = {
    id: entry.id,
    name: entry.name,
    label: entry.label,
    set: entry.set,
    score: 0,
    confidence: 0,
    variant: resolveVariant(entry, options.variant),
    availableVariants: [...entry.variants],
    matchedOn: { keyword: false, vector: false },
    isFallback: true,
  };
  if (glyph && char !== undefined) match.fallbackLetter = char;
  return match;
}
