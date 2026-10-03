import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createLucideAdapter } from "../../packages/pipeline/src/adapters/lucide.js";
import { createTablerAdapter } from "../../packages/pipeline/src/adapters/tabler.js";
import { ingest } from "../../packages/pipeline/src/ingest.js";
import {
  evalSetProblems,
  QUERIES_FILE,
  QUERIES_V1_FILE,
  readEvalSet,
  REQUIRED_GROUPS,
  type EvalSet,
} from "./queries.js";

// Spec §9.1 / §11.1 M3: ≥120 queries, ≥10 fallback, every group, dev/test
// split, every id resolves against the current catalog.
describe("eval/queries.json (v1, frozen)", () => {
  it("passes every §9.1 check against the installed Tabler catalog", async () => {
    const [set, { catalog }] = await Promise.all([
      readEvalSet(QUERIES_V1_FILE),
      ingest([createTablerAdapter({ log: () => undefined })]),
    ]);
    expect(evalSetProblems(set, new Set(catalog.map((e) => e.id)))).toEqual([]);
    expect(new Set(set.queries.map((q) => q.group))).toEqual(
      new Set(REQUIRED_GROUPS),
    );
  });
});

describe("eval/v2/queries.json", () => {
  const v2File = fileURLToPath(new URL("../v2/queries.json", import.meta.url));

  it("is the default eval set", () => {
    expect(QUERIES_FILE).toBe(v2File);
  });

  it("passes every §9.1 check against the installed Tabler catalog", async () => {
    const [set, { catalog }] = await Promise.all([
      readEvalSet(v2File),
      ingest([createTablerAdapter({ log: () => undefined })]),
    ]);
    expect(evalSetProblems(set, new Set(catalog.map((e) => e.id)))).toEqual([]);
  });

  it("is v1 unchanged plus new no-match queries only", async () => {
    const [v1, v2] = await Promise.all([
      readEvalSet(QUERIES_V1_FILE),
      readEvalSet(v2File),
    ]);
    expect(v2.version).toBe(2);
    expect(v2.queries.slice(0, v1.queries.length)).toEqual(v1.queries);
    const added = v2.queries.slice(v1.queries.length);
    expect(added).toHaveLength(30);
    for (const q of added) {
      expect(q.group).toBe("no-match");
      expect(q.acceptable).toEqual([]);
    }
    // Same split rule as v1, applied within the new batch: 30% to test.
    expect(added.filter((q) => q.split === "test")).toHaveLength(9);
  });
});

describe("eval/v3/queries.json (owner-directed label update of v2)", () => {
  const v3File = fileURLToPath(new URL("../v3/queries.json", import.meta.url));

  it("passes every §9.1 check against the installed Tabler catalog", async () => {
    const [set, { catalog }] = await Promise.all([
      readEvalSet(v3File),
      ingest([createTablerAdapter({ log: () => undefined })]),
    ]);
    expect(evalSetProblems(set, new Set(catalog.map((e) => e.id)))).toEqual([]);
  });

  it("is v2 with acceptable ids only added (never removed), splits unchanged, each change logged", async () => {
    const v2File = fileURLToPath(
      new URL("../v2/queries.json", import.meta.url),
    );
    const [v2, v3] = await Promise.all([
      readEvalSet(v2File),
      readEvalSet(v3File),
    ]);
    const changes = (
      JSON.parse(await readFile(v3File, "utf8")) as {
        changes: { query: string; added: string[] }[];
      }
    ).changes;
    const logged = new Map(changes.map((c) => [c.query, c.added]));
    expect(v3.queries.map((q) => [q.query, q.split])).toEqual(
      v2.queries.map((q) => [q.query, q.split]),
    );
    v2.queries.forEach((old, i) => {
      const now = v3.queries[i];
      expect(now?.acceptable.slice(0, old.acceptable.length)).toEqual(
        old.acceptable,
      );
      const added = now?.acceptable.slice(old.acceptable.length) ?? [];
      expect(added).toEqual(logged.get(old.query) ?? []);
    });
  });
});

describe("eval/lucide/queries.json (spec §15.2)", () => {
  const lucideFile = fileURLToPath(
    new URL("../lucide/queries.json", import.meta.url),
  );

  it("passes every §9.1 check against the installed Lucide catalog", async () => {
    const [set, { catalog }] = await Promise.all([
      readEvalSet(lucideFile),
      ingest([createLucideAdapter({ log: () => undefined })]),
    ]);
    expect(evalSetProblems(set, new Set(catalog.map((e) => e.id)))).toEqual([]);
    expect(
      set.queries.every((q) =>
        q.acceptable.every((id) => id.startsWith("lucide:")),
      ),
    ).toBe(true);
  });

  it("has v2's queries, groups and splits, in order", async () => {
    const [v2, lucide] = await Promise.all([
      readEvalSet(QUERIES_FILE),
      readEvalSet(lucideFile),
    ]);
    const shape = (s: typeof v2) =>
      s.queries.map(({ query, group, split }) => ({ query, group, split }));
    expect(shape(lucide)).toEqual(shape(v2));
  });
});

describe("evalSetProblems", () => {
  const ids = new Set(["t:a", "t:b"]);
  const q = (
    query: string,
    extra: Partial<EvalSet["queries"][number]> = {},
  ) => ({
    query,
    acceptable: ["t:a"],
    group: "concrete",
    split: "dev" as const,
    ...extra,
  });

  it("reports unknown ids, bad ideals, duplicates, size, fallbacks, groups and split balance", () => {
    const problems = evalSetProblems(
      {
        version: 1,
        queries: [
          q("Dog", { acceptable: ["t:nope"] }),
          q("dog", { ideal: "t:b" }),
          q("Misc", { acceptable: [], group: "vague", split: "test" }),
        ],
      },
      ids,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        '"Dog": unknown id t:nope',
        '"dog": ideal t:b is not acceptable',
        'duplicate query "dog"',
        "only 3 queries (need ≥ 120)",
        "only 1 fallback queries (need ≥ 10)",
        "no fallback queries in dev",
        "missing group brands",
        "group concrete: test share 0.00 outside 0.2–0.4 (stratified 70/30)",
      ]),
    );
  });
});
