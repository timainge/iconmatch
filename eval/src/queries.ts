import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** One eval query (spec §9.1). Empty `acceptable` means `best()` should fall back. */
export interface EvalQuery {
  query: string;
  acceptable: string[];
  ideal?: string;
  group: string;
  split: "dev" | "test";
}

export interface EvalSet {
  version: number;
  status?: string;
  queries: EvalQuery[];
}

/** The §9.1 groups every eval set must cover. */
export const REQUIRED_GROUPS = [
  "concrete",
  "abstract",
  "hobbies",
  "home-life",
  "brands",
  "vague",
  "no-match",
] as const;

/** The current eval set: v2 (v1 + 30 no-match queries, reviewed 2026-10-02). */
export const QUERIES_FILE = fileURLToPath(
  new URL("../v2/queries.json", import.meta.url),
);

/** The frozen v1 set, kept so earlier results stay reproducible. */
export const QUERIES_V1_FILE = fileURLToPath(
  new URL("../queries.json", import.meta.url),
);

export async function readEvalSet(file = QUERIES_FILE): Promise<EvalSet> {
  return JSON.parse(await readFile(file, "utf8")) as EvalSet;
}

/**
 * Every problem with an eval set (spec §9.1): size, fallback count, groups,
 * split balance, duplicate queries, unknown ids and `ideal` outside
 * `acceptable`. The eval CLI refuses to run on any problem.
 */
export function evalSetProblems(
  set: EvalSet,
  catalogIds: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const qs = set.queries;
  if (qs.length < 120)
    problems.push(`only ${String(qs.length)} queries (need ≥ 120)`);
  const fallbacks = qs.filter((q) => q.acceptable.length === 0);
  if (fallbacks.length < 10)
    problems.push(
      `only ${String(fallbacks.length)} fallback queries (need ≥ 10)`,
    );
  for (const split of ["dev", "test"] as const) {
    if (!fallbacks.some((q) => q.split === split))
      problems.push(`no fallback queries in ${split}`);
  }
  const seen = new Set<string>();
  for (const q of qs) {
    const key = q.query.trim().toLowerCase();
    if (seen.has(key)) problems.push(`duplicate query "${q.query}"`);
    seen.add(key);
    // JSON may hold anything; check at runtime.
    const split: string = q.split;
    if (split !== "dev" && split !== "test")
      problems.push(`"${q.query}": bad split`);
    for (const id of q.acceptable) {
      if (!catalogIds.has(id)) problems.push(`"${q.query}": unknown id ${id}`);
    }
    if (q.ideal !== undefined && !q.acceptable.includes(q.ideal)) {
      problems.push(`"${q.query}": ideal ${q.ideal} is not acceptable`);
    }
  }
  for (const group of REQUIRED_GROUPS) {
    const inGroup = qs.filter((q) => q.group === group);
    if (inGroup.length === 0) {
      problems.push(`missing group ${group}`);
      continue;
    }
    const test =
      inGroup.filter((q) => q.split === "test").length / inGroup.length;
    if (test < 0.2 || test > 0.4) {
      problems.push(
        `group ${group}: test share ${test.toFixed(2)} outside 0.2–0.4 (stratified 70/30)`,
      );
    }
  }
  return problems;
}
