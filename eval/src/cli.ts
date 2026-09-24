import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  createIconMatcher,
  DEFAULT_MIN_CONFIDENCE,
  loadCatalog,
  loadKeywordIndex,
  loadVectors,
  type Embedder,
  type IconMatcherParts,
  type Manifest,
} from "iconmatch";
import { createTransformersEmbedder } from "iconmatch/embedder-transformers";
import { fsSource } from "iconmatch/node";
import { readBuildManifest } from "../../packages/pipeline/src/build-manifest.js";
import { resultsMarkdown } from "./markdown.js";
import {
  compare,
  report,
  thresholdSweep,
  type QueryRun,
  type Report,
} from "./metrics.js";
import {
  evalSetProblems,
  QUERIES_FILE,
  readEvalSet,
  type EvalQuery,
} from "./queries.js";

/** Spec §9.3 configurations available so far (enrichment configs arrive in M4). */
export const CONFIGS = {
  keyword: { keyword: true, vector: false },
  vector: { keyword: false, vector: true },
  baseline: { keyword: true, vector: true },
} as const;
export type ConfigName = keyof typeof CONFIGS;

const USAGE = `Usage: iconmatch-eval [options]

  --config <name>        keyword | vector | baseline (hybrid, no enrichment); repeatable; default all
  --split <dev|test|all> which queries to score (default dev; tune on dev only)
  --data <dir>           build directory (default ./build)
  --queries <file>       eval set (default eval/queries.json)
  --out <dir>            results directory (default eval/results)
  --min-confidence <n>   fallback threshold (default ${String(DEFAULT_MIN_CONFIDENCE)})
  --compare baseline     print deltas vs <out>/baseline.json; exit 1 on a dev Hit@3/MRR drop > 0.02
  --update-baseline      write this run's dev numbers into <out>/baseline.json
  --table                also run every config on dev and test and write <out>/<date>.md (spec §9.3)
`;

function toResult(
  config: ConfigName,
  split: string,
  date: string,
  threshold: number,
  runs: QueryRun[],
): ConfigResult {
  return {
    config,
    split,
    date,
    minConfidence: threshold,
    report: report(runs, threshold),
    sweep: thresholdSweep(runs),
    queries: runs.map((r) => ({
      query: r.query.query,
      group: r.query.group,
      split: r.query.split,
      ranked: r.ranked.slice(0, 5),
      topConfidence: r.topConfidence,
      firstHit: r.ranked.findIndex((id) => r.query.acceptable.includes(id)) + 1,
    })),
  };
}

export interface EvalIo {
  cwd: string;
  log: (m: string) => void;
  error: (m: string) => void;
  createEmbedder?: (manifest: Manifest) => Embedder;
  /** Date stamp for result files (default: today, local). */
  date?: string;
}

export interface ConfigResult {
  config: ConfigName;
  split: string;
  date: string;
  minConfidence: number;
  report: Report;
  sweep: ReturnType<typeof thresholdSweep>;
  queries: {
    query: string;
    group: string;
    split: string;
    ranked: string[];
    topConfidence: number;
    firstHit: number;
  }[];
}

type Baseline = Record<
  string,
  { date: string; dev: { hit3: number; mrr: number } }
>;

const today = () => {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function runConfig(
  config: ConfigName,
  parts: Required<
    Pick<IconMatcherParts, "catalog" | "keywordIndex" | "vectors" | "embedder">
  >,
  queries: EvalQuery[],
): Promise<QueryRun[]> {
  const c = CONFIGS[config];
  const matcher = await createIconMatcher({
    catalog: parts.catalog,
    ...(c.keyword && { keywordIndex: parts.keywordIndex }),
    ...(c.vector && { vectors: parts.vectors, embedder: parts.embedder }),
  });
  const runs: QueryRun[] = [];
  for (const query of queries) {
    const results = await matcher.search(query.query, { limit: 50 });
    runs.push({
      query,
      ranked: results.map((r) => r.id),
      topConfidence: results[0]?.confidence ?? 0,
    });
  }
  return runs;
}

export async function main(argv: string[], io: EvalIo): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        config: { type: "string", multiple: true },
        split: { type: "string", default: "dev" },
        data: { type: "string", default: "build" },
        queries: { type: "string" },
        out: { type: "string" },
        "min-confidence": { type: "string" },
        compare: { type: "string" },
        "update-baseline": { type: "boolean" },
        table: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (e) {
    io.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help === true) {
    io.log(USAGE);
    return 0;
  }
  const configs = (values.config ?? Object.keys(CONFIGS)) as ConfigName[];
  const unknown = configs.filter((c) => !(c in CONFIGS));
  if (unknown.length > 0 || !["dev", "test", "all"].includes(values.split)) {
    io.error(
      `Unknown config or split: ${[...unknown, values.split].join(", ")}\n\n${USAGE}`,
    );
    return 2;
  }
  if (values.compare !== undefined && values.compare !== "baseline") {
    io.error(`--compare only supports "baseline"`);
    return 2;
  }
  const dataDir = resolve(io.cwd, values.data);
  const outDir = values.out
    ? resolve(io.cwd, values.out)
    : fileURLToPath(new URL("../results/", import.meta.url));
  const threshold =
    values["min-confidence"] !== undefined
      ? Number(values["min-confidence"])
      : DEFAULT_MIN_CONFIDENCE;

  const source = fsSource(dataDir);
  const manifest = await readBuildManifest(dataDir);
  const [catalog, keywordIndex, set] = await Promise.all([
    loadCatalog(source, { manifest }),
    loadKeywordIndex(source, { manifest }),
    readEvalSet(
      values.queries ? resolve(io.cwd, values.queries) : QUERIES_FILE,
    ),
  ]);
  const problems = evalSetProblems(set, new Set(catalog.map((e) => e.id)));
  if (problems.length > 0) {
    io.error(
      `eval set has ${String(problems.length)} problem(s):\n${problems.join("\n")}`,
    );
    return 1;
  }
  const vectors = await loadVectors(source, manifest);
  const embedder =
    io.createEmbedder?.(manifest) ??
    createTransformersEmbedder({
      model: manifest.embedding?.model ?? "",
      cacheDir:
        process.env.ICONMATCH_MODEL_CACHE ??
        join(homedir(), ".cache", "iconmatch", "models"),
    });
  const queries = set.queries.filter(
    (q) => values.split === "all" || q.split === values.split,
  );
  const devQueries = set.queries.filter((q) => q.split === "dev");
  const date = io.date ?? today();
  await mkdir(outDir, { recursive: true });

  const baselineFile = join(outDir, "baseline.json");
  const baseline: Baseline = await readFile(baselineFile, "utf8")
    .then((t) => JSON.parse(t) as Baseline)
    .catch(() => ({}));
  let regressions = 0;
  const parts = { catalog, keywordIndex, vectors, embedder };

  for (const config of configs) {
    const runs = await runConfig(config, parts, queries);
    const result = toResult(config, values.split, date, threshold, runs);
    await writeFile(
      join(outDir, `${date}-${config}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
    const m = result.report;
    io.log(
      `${config} (${values.split}, n=${String(m.n)}): Hit@1 ${m.hit1.toFixed(3)} Hit@3 ${m.hit3.toFixed(3)} Hit@5 ${m.hit5.toFixed(3)} MRR ${m.mrr.toFixed(3)} ` +
        `fallback P ${m.fallback.precision.toFixed(2)} R ${m.fallback.recall.toFixed(2)} @ ${String(threshold)}`,
    );

    if (values.compare !== undefined || values["update-baseline"] === true) {
      // Regression discipline is on dev only (spec §9.4).
      const dev =
        values.split === "dev"
          ? m
          : report(await runConfig(config, parts, devQueries), threshold);
      const base = baseline[config];
      if (values.compare !== undefined) {
        if (!base) io.log(`  ${config}: no baseline entry`);
        else
          for (const d of compare(config, dev, base.dev)) {
            io.log(
              `  ${d.metric} ${d.baseline.toFixed(3)} → ${d.current.toFixed(3)} (${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(3)})${d.regression ? "  REGRESSION" : ""}`,
            );
            if (d.regression) regressions++;
          }
      }
      if (values["update-baseline"] === true)
        baseline[config] = { date, dev: { hit3: dev.hit3, mrr: dev.mrr } };
    }
  }
  if (values["update-baseline"] === true)
    await writeFile(baselineFile, JSON.stringify(baseline, null, 2) + "\n");

  if (values.table === true) {
    const bySplit = { dev: [] as ConfigResult[], test: [] as ConfigResult[] };
    for (const split of ["dev", "test"] as const) {
      const qs = set.queries.filter((q) => q.split === split);
      for (const config of configs) {
        const r = toResult(
          config,
          split,
          date,
          threshold,
          await runConfig(config, parts, qs),
        );
        bySplit[split].push(r);
        const suffix = split === "dev" ? "" : `-${split}`;
        await writeFile(
          join(outDir, `${date}-${config}${suffix}.json`),
          JSON.stringify(r, null, 2) + "\n",
        );
      }
    }
    const reviewed = await readFile(join(dirname(QUERIES_FILE), "REVIEWED"))
      .then(() => true)
      .catch(() => false);
    const file = join(outDir, `${date}.md`);
    await writeFile(
      file,
      resultsMarkdown({
        date,
        reviewed,
        ...bySplit,
        notes: [
          `Model \`${manifest.embedding?.model ?? "none"}\` (${manifest.embedding?.quantisation ?? "-"}), ${String(catalog.length)} icons, enrichment: none. Configs: keyword = 1, vector = 2, baseline = 3 (hybrid, no enrichment); 4–7 arrive with M4/M5.`,
        ],
      }),
    );
    io.log(`table: ${file}`);
  }
  if (regressions > 0) {
    io.error(
      `${String(regressions)} regression(s) beyond ${String(0.02)} on dev`,
    );
    return 1;
  }
  return 0;
}
