import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeTabler200DataDir } from "../../test-support/data-dir.js";
import { createFakeEmbedder } from "../../test-support/fake-embedder.js";
import { fixturePath } from "../../test-support/fixtures.js";
import { main, type ConfigResult, type EvalIo } from "./cli.js";
import { REQUIRED_GROUPS, type EvalQuery } from "./queries.js";

let dataDir: string;
let outDir: string;
let queriesFile: string;
let out: string[];
let err: string[];
let io: EvalIo;

/** A valid eval set on fixture ids: 7 groups × 18, 2 fallbacks per group, 5 test each. */
async function fixtureQueries(): Promise<EvalQuery[]> {
  const catalog = JSON.parse(
    await readFile(fixturePath("tabler-200", "catalog.json"), "utf8"),
  ) as {
    id: string;
    label: string;
    glyph?: string;
  }[];
  const icons = catalog.filter((e) => !e.glyph);
  return REQUIRED_GROUPS.flatMap((group, g) =>
    Array.from({ length: 18 }, (_, i): EvalQuery => {
      const icon = icons[(g * 18 + i) % icons.length];
      const fallback = i < 2;
      return {
        query: fallback
          ? `zzqx ${group} ${String(i)}`
          : `${icon?.label ?? ""} ${group}`,
        acceptable: fallback || !icon ? [] : [icon.id],
        group,
        split: i % 4 === 1 ? "test" : "dev",
      };
    }),
  );
}

beforeAll(async () => {
  dataDir = await writeTabler200DataDir(createFakeEmbedder({ dims: 32 }));
  await writeFile(
    join(dataDir, "embed-meta.json"),
    JSON.stringify({
      model: "fake/hash-embedder",
      dims: 32,
      quantisation: "int8",
      count: 200,
    }),
  );
  outDir = await mkdtemp(join(tmpdir(), "iconmatch-eval-"));
  queriesFile = join(outDir, "queries.json");
  await writeFile(
    queriesFile,
    JSON.stringify({ version: 1, queries: await fixtureQueries() }),
  );
});
afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(outDir, { recursive: true, force: true });
});

function freshIo(): EvalIo {
  out = [];
  err = [];
  return {
    cwd: "/",
    log: (m) => out.push(m),
    error: (m) => err.push(m),
    createEmbedder: () => createFakeEmbedder({ dims: 32 }),
    date: "2026-09-24",
  };
}
const args = (...extra: string[]) => [
  "--data",
  dataDir,
  "--queries",
  queriesFile,
  "--out",
  outDir,
  ...extra,
];

describe("iconmatch-eval", () => {
  it("runs configs 1–3 on dev and writes JSON results with per-group metrics and a sweep", async () => {
    io = freshIo();
    expect(await main(args(), io)).toBe(0);
    expect(out.map((l) => l.split(" ")[0])).toEqual([
      "keyword",
      "vector",
      "baseline",
    ]);
    const result = JSON.parse(
      await readFile(join(outDir, "2026-09-24-baseline.json"), "utf8"),
    ) as ConfigResult;
    expect(result).toMatchObject({
      config: "baseline",
      split: "dev",
      minConfidence: 0.5,
    });
    expect(result.report.n).toBe(7 * 12);
    expect(result.report.hit5).toBeGreaterThan(0);
    expect(Object.keys(result.report.perGroup).sort()).toEqual(
      [...REQUIRED_GROUPS].sort(),
    );
    expect(result.sweep).toHaveLength(11);
    expect(result.queries.every((q) => q.split === "dev")).toBe(true);
  });

  it("--split test scores only test queries", async () => {
    io = freshIo();
    expect(await main(args("--config", "keyword", "--split", "test"), io)).toBe(
      0,
    );
    const result = JSON.parse(
      await readFile(join(outDir, "2026-09-24-keyword.json"), "utf8"),
    ) as ConfigResult;
    expect(result.queries.length).toBe(7 * 5);
    expect(result.queries.every((q) => q.split === "test")).toBe(true);
  });

  it("--update-baseline then --compare baseline passes; a worse baseline fails", async () => {
    io = freshIo();
    expect(
      await main(args("--config", "keyword", "--update-baseline"), io),
    ).toBe(0);
    const baseline = JSON.parse(
      await readFile(join(outDir, "baseline.json"), "utf8"),
    ) as Record<string, { dev: { hit3: number; mrr: number } }>;
    expect(baseline.keyword?.dev.hit3).toBeGreaterThan(0);
    io = freshIo();
    expect(
      await main(args("--config", "keyword", "--compare", "baseline"), io),
    ).toBe(0);
    expect(out.join("\n")).toMatch(/hit3 .* \(\+0\.000\)/);
    // Pretend the baseline was 0.05 better on Hit@3: the current run is a regression.
    const current = baseline.keyword?.dev ?? { hit3: 0, mrr: 0 };
    await writeFile(
      join(outDir, "baseline.json"),
      JSON.stringify({
        keyword: {
          date: "x",
          dev: { hit3: current.hit3 + 0.05, mrr: current.mrr },
        },
      }),
    );
    io = freshIo();
    expect(
      await main(args("--config", "keyword", "--compare", "baseline"), io),
    ).toBe(1);
    expect(out.join("\n")).toContain("REGRESSION");
    expect(err[0]).toMatch(/regression\(s\) beyond 0.02 on dev/);
  });

  it("fails loudly on unknown ids in the eval set", async () => {
    const bad = join(outDir, "bad.json");
    const qs = await fixtureQueries();
    qs[3] = {
      ...qs[3],
      query: "broken",
      acceptable: ["tabler:does-not-exist"],
      group: "concrete",
      split: "dev",
    };
    await writeFile(bad, JSON.stringify({ version: 1, queries: qs }));
    io = freshIo();
    expect(
      await main(["--data", dataDir, "--queries", bad, "--out", outDir], io),
    ).toBe(1);
    expect(err[0]).toContain('"broken": unknown id tabler:does-not-exist');
  });

  it("rejects unknown configs and splits", async () => {
    io = freshIo();
    expect(await main(args("--config", "enriched"), io)).toBe(2);
    expect(await main(args("--split", "train"), io)).toBe(2);
  });
});
