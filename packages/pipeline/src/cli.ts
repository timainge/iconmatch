import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Embedder } from "iconmatch";
import {
  createTransformersEmbedder,
  type TransformersEmbedderOptions,
} from "iconmatch/embedder-transformers";
import {
  resolveConfig,
  type IconmatchConfig,
  type ResolvedConfig,
} from "./config.js";
import { runEmbed } from "./embed.js";
import { formatSizes, runPackage } from "./package.js";
import { createProvider, type EnrichmentProvider } from "./enrich/provider.js";
import { readBuildEnrichments, runEnrichStage } from "./enrich/stage.js";
import { ingest, writeIngest } from "./ingest.js";
import { runIndex } from "./index.js";

const USAGE = `Usage: iconmatch-build <stage> [options]

Stages:
  ingest    icon sets -> build/catalog.json + build/svgs.json
  enrich    LLM enrichment (--mode none|text|vision) -> build/enrichments.json
  embed     build/catalog.json -> build/vectors.bin + vector-ids.json
  index     build/catalog.json -> build/keyword-index.json
  package   build/ -> packages/core/data/ + manifest.json + licenses, size report
  all       every implemented stage, in order

Options:
  --config <file>     config file (default ./iconmatch.config.ts if present)
  --build-dir <dir>   override the config's buildDir
  --package-dir <dir> override the config's packageDir
  --float32           embed: store float32 vectors instead of int8
  --mode <mode>       enrich: text | none (default from config)
  --limit <n>         enrich: process at most n uncached icons
  --model <name>      enrich: override the text model
  -h, --help          show this help
`;

export interface CliIo {
  cwd: string;
  log: (message: string) => void;
  error: (message: string) => void;
  /** Test seam: replaces the transformers.js embedder for `embed`. */
  createEmbedder?: (config: ResolvedConfig) => Embedder;
  /** Test seam: replaces the configured enrichment provider. */
  createProvider?: (
    config: ResolvedConfig,
    model: string,
  ) => EnrichmentProvider;
}

interface StageOptions {
  limit?: number;
}

function transformersEmbedder(config: ResolvedConfig): Embedder {
  const options: TransformersEmbedderOptions = {
    model: config.embed.model,
    localOnly: config.embed.localOnly,
    cacheDir: config.embed.cacheDir,
  };
  if (config.embed.modelLocation !== undefined)
    options.modelLocation = config.embed.modelLocation;
  return createTransformersEmbedder(options);
}

const defaultIo: CliIo = {
  cwd: process.cwd(),
  log: (m) => {
    console.log(m);
  },
  error: (m) => {
    console.error(m);
  },
};

async function loadConfig(
  file: string | undefined,
  cwd: string,
): Promise<{ config: IconmatchConfig; root: string }> {
  const path = resolve(cwd, file ?? "iconmatch.config.ts");
  if (!existsSync(path)) {
    if (file !== undefined) throw new Error(`Config file not found: ${path}`);
    return { config: {}, root: cwd };
  }
  const mod = (await import(pathToFileURL(path).href)) as {
    default?: IconmatchConfig;
  };
  return { config: mod.default ?? {}, root: dirname(path) };
}

const STAGES = {
  async ingest(config: ResolvedConfig, io: CliIo) {
    const result = await ingest(config.sets);
    const paths = await writeIngest(result, config.buildDir);
    io.log(
      `ingest: ${String(result.catalog.length)} icons -> ${paths.catalog}, ${paths.svgs}`,
    );
  },
  async enrich(config: ResolvedConfig, io: CliIo, opts: StageOptions) {
    const mode = config.enrich.mode;
    const make = (model: string) =>
      io.createProvider?.(config, model) ??
      createProvider({
        provider: config.enrich.provider,
        baseUrl: config.enrich.baseUrl,
        model,
      });
    const provider =
      mode === "none" ? undefined : make(config.enrich.textModel);
    const visionProvider =
      mode === "vision" ? make(config.enrich.visionModel) : undefined;
    const { written, stats } = await runEnrichStage(config.buildDir, {
      mode,
      visionFor: config.enrich.visionFor,
      ...(visionProvider && { visionProvider }),
      cacheFile: config.enrich.cacheFile,
      concurrency: config.enrich.concurrency,
      log: io.log,
      ...(provider && { provider }),
      ...(opts.limit !== undefined && { limit: opts.limit }),
    });
    if (stats) {
      io.log(
        `enrich: ${String(stats.enriched)} new (${String(stats.vision)} vision), ${String(stats.cached)} cached, ${String(stats.failed.length)} failed, ${String(stats.skippedByLimit)} left by --limit`,
      );
      for (const f of stats.failed.slice(0, 5))
        io.error(`  ${f.id}: ${f.error}`);
    }
    io.log(
      `enrich: ${mode}, ${String(written)} enrichments -> ${join(config.buildDir, "enrichments.json")}`,
    );
  },
  async embed(config: ResolvedConfig, io: CliIo) {
    const embedder = (io.createEmbedder ?? transformersEmbedder)(config);
    const meta = await runEmbed(config.buildDir, {
      enrichments: await readBuildEnrichments(config.buildDir),
      embedder,
      quantisation: config.embed.quantisation,
      log: io.log,
    });
    io.log(
      `embed: ${String(meta.count)} × ${String(meta.dims)} ${meta.quantisation} (${meta.model})`,
    );
  },
  async package(config: ResolvedConfig, io: CliIo) {
    const { manifest, sizes } = await runPackage(
      config.buildDir,
      config.packageDir,
      {
        enrich: config.enrich,
      },
    );
    io.log(
      `package: ${String(manifest.sets.reduce((n, s) => n + s.count, 0))} icons, enrichment ${manifest.enrichment?.mode ?? "none"} -> ${config.packageDir}\n${formatSizes(sizes)}`,
    );
  },
  async index(config: ResolvedConfig, io: CliIo) {
    const enrichments = await readBuildEnrichments(config.buildDir);
    io.log(`index: -> ${await runIndex(config.buildDir, enrichments)}`);
  },
} as const;

const PENDING = new Set<string>();
const ORDER = ["ingest", "enrich", "embed", "index", "package"] as const;

/** Runs the CLI; returns the process exit code. */
export async function main(
  argv: string[],
  io: CliIo = defaultIo,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        config: { type: "string" },
        "build-dir": { type: "string" },
        "package-dir": { type: "string" },
        float32: { type: "boolean" },
        mode: { type: "string" },
        limit: { type: "string" },
        model: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    io.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [stage, ...extra] = positionals;
  if (values.help === true || stage === undefined) {
    (values.help === true ? io.log : io.error)(USAGE);
    return values.help === true ? 0 : 2;
  }
  if (
    extra.length > 0 ||
    !(stage in STAGES || PENDING.has(stage) || stage === "all")
  ) {
    io.error(`Unknown stage: ${[stage, ...extra].join(" ")}\n\n${USAGE}`);
    return 2;
  }
  if (PENDING.has(stage)) {
    io.error(`Stage "${stage}" is not implemented yet.`);
    return 1;
  }

  try {
    const { config, root } = await loadConfig(values.config, io.cwd);
    const resolved = resolveConfig(config);
    resolved.buildDir = resolve(
      io.cwd,
      values["build-dir"] ?? resolve(root, resolved.buildDir),
    );
    resolved.packageDir =
      values["package-dir"] !== undefined
        ? resolve(io.cwd, values["package-dir"])
        : resolve(root, resolved.packageDir);
    if (values.float32 === true) resolved.embed.quantisation = "float32";
    if (values.mode !== undefined) {
      if (!["none", "text", "vision"].includes(values.mode))
        throw new Error(`Unknown --mode ${values.mode}`);
      resolved.enrich.mode = values.mode as ResolvedConfig["enrich"]["mode"];
    }
    if (values.model !== undefined) resolved.enrich.textModel = values.model;
    resolved.enrich.cacheFile = resolve(root, resolved.enrich.cacheFile);
    const opts: StageOptions = {};
    if (values.limit !== undefined) {
      const n = Number(values.limit);
      if (!Number.isInteger(n) || n < 0)
        throw new Error(`--limit must be a non-negative integer`);
      opts.limit = n;
    }
    const stages = stage === "all" ? ORDER : [stage];
    for (const s of stages) {
      if (s in STAGES)
        await STAGES[s as keyof typeof STAGES](resolved, io, opts);
      else io.log(`${s}: skipped (not implemented yet)`);
    }
    return 0;
  } catch (e) {
    io.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
