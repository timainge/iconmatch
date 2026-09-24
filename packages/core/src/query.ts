/**
 * Normalises a query for keyword search (spec §7.2 step 1): trim, lowercase,
 * collapse whitespace, strip possessives and punctuation, keep hyphens.
 * The raw query is still used for embedding.
 */
export function normaliseQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/(\p{L})'s\b/gu, "$1")
    .replace(/(\p{L}s)'(?!\p{L})/gu, "$1")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
