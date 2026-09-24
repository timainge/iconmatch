import type { SvgBody, VariantName } from "iconmatch";

export type { VariantName };

/**
 * One icon set behind a stable interface (spec §3, §6.1), so another set can
 * be added without touching search code.
 */
export interface IconSetAdapter {
  /** Short stable id, e.g. "tabler". Used as the id prefix. */
  id: string;
  /** Source package version, known after `load()`; goes in the manifest. */
  version?: string;
  license: { spdx: string; url: string; attributionRequired: boolean };
  /** Variants this set supports, in preference order. First is the default. */
  variants: VariantName[];
  load(): Promise<RawIcon[]>;
  /** The set's licence text, shipped in `data/licenses/` (spec §8). */
  licenseText?(): Promise<string>;
}

/** SVG inner markup plus its viewBox size. */
export type RawVariant = SvgBody;

export interface RawIcon {
  /** Base concept name, kebab-case, WITHOUT variant suffix, e.g. "heart". */
  name: string;
  /** SVG body (inner markup) + viewBox per available variant. */
  variants: Partial<Record<VariantName, RawVariant>>;
  /** From the source library, lowercase, deduped. */
  tags: string[];
  /** From the source library. */
  categories: string[];
  deprecated?: boolean;
  /** Depicts a third-party trademark (spec §6.1 rule 3). */
  brand?: boolean;
  /** Letter/number glyph used by the lettered fallback (spec §7.4). */
  glyph?: "letter" | "number";
}

/** Lowercase, trim, drop empties and dedupe, keeping first-seen order. */
export function normaliseTags(tags: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, " ");
    if (t) out.add(t);
  }
  return [...out];
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Checks the RawIcon invariants an adapter must uphold. Returns the problems
 * found (empty when valid) so ingest can report every bad icon at once.
 */
export function rawIconProblems(
  icon: RawIcon,
  adapter: Pick<IconSetAdapter, "variants">,
): string[] {
  const problems: string[] = [];
  if (!KEBAB.test(icon.name))
    problems.push(`name "${icon.name}" is not kebab-case`);
  const present = Object.keys(icon.variants) as VariantName[];
  if (present.length === 0) problems.push("has no variants");
  for (const v of present) {
    if (!adapter.variants.includes(v)) {
      problems.push(`variant "${v}" is not supported by the adapter`);
    }
  }
  // Only non-default variants appear as name suffixes; names like
  // "text-outline" are real concepts in an outline-default set.
  for (const v of adapter.variants.slice(1)) {
    if (icon.name.endsWith(`-${v}`)) {
      problems.push(`name carries the variant suffix "-${v}"`);
    }
  }
  const tags = normaliseTags(icon.tags);
  if (
    tags.length !== icon.tags.length ||
    tags.some((t, i) => t !== icon.tags[i])
  ) {
    problems.push("tags are not lowercase and deduped");
  }
  return problems;
}
