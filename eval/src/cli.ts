import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  createIconMatcher,
  DEFAULT_KEYWORD_MIN_CONFIDENCE,
  DEFAULT_MIN_CONFIDENCE,
  loadCatalog,
  loadKeywordIndex,
  loadVectors,
  type Embedder,
  type IconMatcherParts,
  type Manifest,
} from "@iconmatch/core";
import { createTransformersEmbedder } from "@iconmatch/core/embedder-transformers";
import { fsSource } from "@iconmatch/core/node";
import { readBuildManifest } from "../../packages/pipeline/src/build-manifest.js";
import { ollamaExpander } from "../../examples/query-expansion/ollama-expander.js";
import {
  readExpansions,
  resolveExpansions,
  writeExpansions,
} from "./expansions.js";
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

/**
 * Spec §9.3 configurations. `data` picks the build directory: the base one
 * (`--data`, no enrichment) or an enriched build (`--data-text`, `--data-vision`).
 * `expand` runs search with the recorded query expansions (config 6).
 */
export const CONFIGS = {
  keyword: { keyword: true, vector: false, data: "base", expand: false },
  vector: { keyword: false, vector: true, data: "base", expand: false },
  baseline: { keyword: true, vector: true, data: "base", expand: false },
  text: { keyword: true, vector: true, data: "text", expand: false },
  vision: { keyword: true, vector: true, data: "vision", expand: false },
  expansion: { keyword: true, vector: true, data: "vision", expand: true },
  "baseline-expansion": {
    keyword: true,
    vector: true,
    data: "base",
    expand: true,
  },
  float32: { keyword: true, vector: true, data: "float32", expand: false },
} as const;
export type ConfigName = keyof typeof CONFIGS;

const USAGE = `Usage: iconmatch-eval [options]

  --config <name>        keyword | vector | baseline (hybrid, no enrichment) | text (hybrid + text
                         enrichment) | vision (hybrid + text + vision) | expansion (vision + query
                         expansion) | baseline-expansion (baseline + query expansion) | float32
                         (baseline with float32 vectors); repeatable; default all
                         (configs are skipped when their build dir or expansions are missing)
  --split <dev|test|all> which queries to score (default dev; tune on dev only)
  --data <dir>           build directory (default ./build)
  --data-text <dir>      build with text enrichment (default ./build-text)
  --data-vision <dir>    build with text + vision enrichment (default ./build-vision)
  --data-float32 <dir>   baseline build with float32 vectors (default ./build-float32)
  --expansions <file>    recorded query expansions (default eval/expansions.json)
  --expander ollama      fetch missing expansions with examples/query-expansion (Ollama at
                         --ollama-url, model --expander-model) and record them
  --queries <file>       eval set (default eval/queries.json)
  --out <dir>            results directory (default eval/results)
  --min-confidence <n>   fallback threshold for every config (default: the library's,
                         ${String(DEFAULT_MIN_CONFIDENCE)} with vectors, ${String(DEFAULT_KEYWORD_MIN_CONFIDENCE)} keyword-only)
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
  /** Live expander for `--expander` (default: the Ollama example). */
  createExpander?: (options: {
    baseUrl: string;
    model: string;
  }) => (query: string) => Promise<string[]>;
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

type Parts = Required<
  Pick<IconMatcherParts, "catalog" | "keywordIndex" | "vectors" | "embedder">
> &
  Pick<IconMatcherParts, "expandQuery">;

export async function runConfig(
  config: ConfigName,
  parts: Parts,
  queries: EvalQuery[],
): Promise<QueryRun[]> {
  const c = CONFIGS[config];
  const matcher = await createIconMatcher({
    catalog: parts.catalog,
    ...(c.keyword && { keywordIndex: parts.keywordIndex }),
    ...(c.vector && { vectors: parts.vectors, embedder: parts.embedder }),
    ...(c.expand && parts.expandQuery && { expandQuery: parts.expandQuery }),
  });
  if (c.expand && !parts.expandQuery) throw new Error(`${config}: no expander`);
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
        "data-text": { type: "string", default: "build-text" },
        "data-vision": { type: "string", default: "build-vision" },
        "data-float32": { type: "string", default: "build-float32" },
        expansions: { type: "string" },
        expander: { type: "string" },
        "expander-model": { type: "string", default: "qwen2.5:7b-instruct" },
        "ollama-url": { type: "string", default: "http://127.0.0.1:11434" },
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
  const requested = (values.config ?? Object.keys(CONFIGS)) as ConfigName[];
  const unknown = requested.filter((c) => !(c in CONFIGS));
  if (unknown.length > 0 || !["dev", "test", "all"].includes(values.split)) {
    io.error(
      `Unknown config or split: ${[...unknown, values.split].join(", ")}\n\n${USAGE}`,
    );
    return 2;
  }
  if (values.expander !== undefined && values.expander !== "ollama") {
    io.error(`--expander only supports "ollama"`);
    return 2;
  }
  if (values.compare !== undefined && values.compare !== "baseline") {
    io.error(`--compare only supports "baseline"`);
    return 2;
  }
  const dataDirs = {
    base: resolve(io.cwd, values.data),
    text: resolve(io.cwd, values["data-text"]),
    vision: resolve(io.cwd, values["data-vision"]),
    float32: resolve(io.cwd, values["data-float32"]),
  } as const;
  const dataDir = dataDirs.base;
  const expansionsFile = values.expansions
    ? resolve(io.cwd, values.expansions)
    : fileURLToPath(new URL("../expansions.json", import.meta.url));
  const recorded = await readExpansions(expansionsFile);
  const live =
    values.expander === "ollama"
      ? {
          name: `ollama:${values["expander-model"]}`,
          expand: (io.createExpander ?? ollamaExpander)({
            baseUrl: values["ollama-url"],
            model: values["expander-model"],
          }),
        }
      : undefined;
  const configs: ConfigName[] = [];
  for (const c of requested) {
    const dir = dataDirs[CONFIGS[c].data];
    const why = !existsSync(join(dir, "catalog.json"))
      ? `no build in ${dir}`
      : CONFIGS[c].expand && !recorded && !live
        ? `no expansions in ${expansionsFile} and no --expander`
        : undefined;
    if (!why) configs.push(c);
    else if (values.config) {
      io.error(`${c}: ${why}`);
      return 1;
    } else io.log(`${c}: skipped (${why})`);
  }
  const outDir = values.out
    ? resolve(io.cwd, values.out)
    : fileURLToPath(new URL("../v2/results/", import.meta.url));
  // Mirror best(): keyword-only configs use the keyword threshold.
  const thresholdFor = (config: ConfigName) =>
    values["min-confidence"] !== undefined
      ? Number(values["min-confidence"])
      : CONFIGS[config].vector
        ? DEFAULT_MIN_CONFIDENCE
        : DEFAULT_KEYWORD_MIN_CONFIDENCE;

  const queriesFile = values.queries
    ? resolve(io.cwd, values.queries)
    : QUERIES_FILE;
  const source = fsSource(dataDir);
  const manifest = await readBuildManifest(dataDir);
  const [catalog, set] = await Promise.all([
    loadCatalog(source, { manifest }),
    readEvalSet(queriesFile),
  ]);
  const problems = evalSetProblems(set, new Set(catalog.map((e) => e.id)));
  if (problems.length > 0) {
    io.error(
      `eval set has ${String(problems.length)} problem(s):\n${problems.join("\n")}`,
    );
    return 1;
  }
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
  let expandQuery: Parts["expandQuery"];
  if (configs.some((c) => CONFIGS[c].expand)) {
    let resolved;
    try {
      resolved = await resolveExpansions(
        set.queries.map((q) => q.query),
        recorded,
        live,
      );
    } catch (e) {
      io.error(`expansions: ${(e as Error).message}`);
      return 1;
    }
    if (resolved.fetched > 0) {
      await writeExpansions(expansionsFile, resolved.file);
      io.log(
        `expansions: fetched ${String(resolved.fetched)} with ${resolved.file.expander}, recorded in ${expansionsFile}`,
      );
    }
    const map = resolved.file.expansions;
    expandQuery = (q) => Promise.resolve(map[q] ?? []);
  }
  const date = io.date ?? today();
  await mkdir(outDir, { recursive: true });

  const baselineFile = join(outDir, "baseline.json");
  const baseline: Baseline = await readFile(baselineFile, "utf8")
    .then((t) => JSON.parse(t) as Baseline)
    .catch(() => ({}));
  let regressions = 0;
  const loaded = new Map<string, Promise<Parts>>();
  const partsFor = (config: ConfigName): Promise<Parts> => {
    const dir = dataDirs[CONFIGS[config].data];
    let p = loaded.get(dir);
    if (!p) {
      p = (async () => {
        const src = fsSource(dir);
        const m = await readBuildManifest(dir);
        return {
          catalog: await loadCatalog(src, { manifest: m }),
          keywordIndex: await loadKeywordIndex(src, { manifest: m }),
          vectors: await loadVectors(src, m),
          embedder,
          ...(expandQuery && { expandQuery }),
        };
      })();
      loaded.set(dir, p);
    }
    return p;
  };

  for (const config of configs) {
    const runs = await runConfig(config, await partsFor(config), queries);
    const threshold = thresholdFor(config);
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
          : report(
              await runConfig(config, await partsFor(config), devQueries),
              threshold,
            );
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
          thresholdFor(config),
          await runConfig(config, await partsFor(config), qs),
        );
        bySplit[split].push(r);
        const suffix = split === "dev" ? "" : `-${split}`;
        await writeFile(
          join(outDir, `${date}-${config}${suffix}.json`),
          JSON.stringify(r, null, 2) + "\n",
        );
      }
    }
    // The review marker sits next to the eval set that was scored.
    const reviewed = await readFile(join(dirname(queriesFile), "REVIEWED"))
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
          `Model \`${manifest.embedding?.model ?? "none"}\` (${manifest.embedding?.quantisation ?? "-"}), ${String(catalog.length)} icons. Configs (spec §9.3): keyword = 1, vector = 2, baseline = 3 (hybrid, no enrichment), text = 4, vision = 5 (text + vision), expansion = 6 (5 + query expansion), float32 = 7 (baseline with float32 vectors); baseline-expansion = 3 + query expansion.`,
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
