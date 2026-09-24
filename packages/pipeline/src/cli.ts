import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
import { ingest, writeIngest } from "./ingest.js";
import { runIndex } from "./index.js";

const USAGE = `Usage: iconmatch-build <stage> [options]

Stages:
  ingest    icon sets -> build/catalog.json + build/svgs.json
  enrich    (not implemented yet: M4)
  embed     build/catalog.json -> build/vectors.bin + vector-ids.json
  index     build/catalog.json -> build/keyword-index.json
  package   (not implemented yet: M5)
  all       every implemented stage, in order

Options:
  --config <file>     config file (default ./iconmatch.config.ts if present)
  --build-dir <dir>   override the config's buildDir
  --float32           embed: store float32 vectors instead of int8
  -h, --help          show this help
`;

export interface CliIo {
  cwd: string;
  log: (message: string) => void;
  error: (message: string) => void;
  /** Test seam: replaces the transformers.js embedder for `embed`. */
  createEmbedder?: (config: ResolvedConfig) => Embedder;
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
  async embed(config: ResolvedConfig, io: CliIo) {
    const embedder = (io.createEmbedder ?? transformersEmbedder)(config);
    const meta = await runEmbed(config.buildDir, {
      embedder,
      quantisation: config.embed.quantisation,
      log: io.log,
    });
    io.log(
      `embed: ${String(meta.count)} × ${String(meta.dims)} ${meta.quantisation} (${meta.model})`,
    );
  },
  async index(config: ResolvedConfig, io: CliIo) {
    io.log(`index: -> ${await runIndex(config.buildDir)}`);
  },
} as const;

const PENDING = new Set(["enrich", "package"]);
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
        float32: { type: "boolean" },
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
    resolved.packageDir = resolve(root, resolved.packageDir);
    if (values.float32 === true) resolved.embed.quantisation = "float32";
    const stages = stage === "all" ? ORDER : [stage];
    for (const s of stages) {
      if (s in STAGES) await STAGES[s as keyof typeof STAGES](resolved, io);
      else io.log(`${s}: skipped (not implemented yet)`);
    }
    return 0;
  } catch (e) {
    io.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
