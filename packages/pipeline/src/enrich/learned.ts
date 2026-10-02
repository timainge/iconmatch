import { readFile } from "node:fs/promises";
import type { ChoiceEntry } from "@iconmatch/core";

/**
 * Enrichment v3, variant 3 (spec §15.5): learned concepts. Apps export their
 * users' choice memories (`ChoiceMemory.export()`); a maintainer collects
 * them into one JSON file, an array with one export per user. A name becomes
 * a concept of an icon when at least `minUsers` different users chose that
 * icon for it, so one person's idiosyncratic names don't leak to everyone.
 */
export interface LearnedOptions {
  /** Distinct users who must have made the same choice. Default 2. */
  minUsers?: number;
  /** Most concepts kept per icon, most widely chosen first. Default 15. */
  maxConcepts?: number;
}

export const DEFAULT_LEARNED_MIN_USERS = 2;

/** Reads a file holding an array of choice exports (one per user). */
export async function readChoiceExports(
  file: string,
): Promise<ChoiceEntry[][]> {
  const data = JSON.parse(await readFile(file, "utf8")) as unknown;
  if (
    !Array.isArray(data) ||
    !data.every(
      (u) =>
        Array.isArray(u) &&
        u.every(
          (e) =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as ChoiceEntry).query === "string" &&
            typeof (e as ChoiceEntry).iconId === "string",
        ),
    )
  )
    throw new Error(
      `${file}: expected an array of choice exports (arrays of { query, iconId, … })`,
    );
  return data as ChoiceEntry[][];
}

/** Learned concepts per icon id, from many users' choice exports. */
export function learnedConcepts(
  exports: ChoiceEntry[][],
  iconIds: ReadonlySet<string>,
  options: LearnedOptions = {},
): Map<string, string[]> {
  const minUsers = options.minUsers ?? DEFAULT_LEARNED_MIN_USERS;
  const maxConcepts = options.maxConcepts ?? 15;
  // icon -> query -> number of distinct users
  const users = new Map<string, Map<string, number>>();
  for (const userExport of exports) {
    const seen = new Set<string>();
    for (const { query, iconId } of userExport) {
      const q = query.trim();
      const key = `${iconId}\u0000${q}`;
      if (!q || !iconIds.has(iconId) || seen.has(key)) continue;
      seen.add(key);
      const byQuery = users.get(iconId) ?? new Map<string, number>();
      byQuery.set(q, (byQuery.get(q) ?? 0) + 1);
      users.set(iconId, byQuery);
    }
  }
  const out = new Map<string, string[]>();
  for (const [iconId, byQuery] of [...users].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const concepts = [...byQuery]
      .filter(([, n]) => n >= minUsers)
      .sort(([qa, a], [qb, b]) => b - a || (qa < qb ? -1 : 1))
      .slice(0, maxConcepts)
      .map(([q]) => q);
    if (concepts.length > 0) out.set(iconId, concepts);
  }
  return out;
}
