import type { IconSetAdapter } from "./adapters/types.js";
import { createTablerAdapter } from "./adapters/tabler.js";

export type EnrichMode = "none" | "text" | "vision";

/** `iconmatch.config.ts` shape (spec §6). Every field is optional. */
export interface IconmatchConfig {
  /** Icon sets to include. Default: Tabler, outline only, brands included. */
  sets?: IconSetAdapter[];
  /** Stage outputs. Relative paths resolve against the config file's directory. */
  buildDir?: string;
  /** Where `package` copies artifacts. */
  packageDir?: string;
  enrich?: {
    mode?: EnrichMode;
    visionFor?: "all" | "sparse";
    provider?: "ollama" | "openai-compatible";
    baseUrl?: string;
    textModel?: string;
    visionModel?: string;
    concurrency?: number;
    cacheFile?: string;
  };
  embed?: {
    model?: string;
    quantisation?: "int8" | "float32";
  };
}

export interface ResolvedConfig {
  sets: IconSetAdapter[];
  buildDir: string;
  packageDir: string;
  enrich: Required<NonNullable<IconmatchConfig["enrich"]>>;
  embed: Required<NonNullable<IconmatchConfig["embed"]>>;
}

/** Identity helper for type-checked config files. */
export function defineConfig(config: IconmatchConfig): IconmatchConfig {
  return config;
}

export const DEFAULT_CONFIG: Omit<ResolvedConfig, "sets"> = {
  buildDir: "build",
  packageDir: "packages/core/data",
  enrich: {
    mode: "none",
    visionFor: "sparse",
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    textModel: "qwen2.5:7b-instruct",
    visionModel: "qwen2.5vl:7b",
    concurrency: 2,
    cacheFile: "packages/pipeline/cache/enrichment.jsonl",
  },
  embed: {
    model: "Xenova/bge-small-en-v1.5",
    quantisation: "int8",
  },
};

/** Fills defaults. Paths stay as given; the CLI resolves them against the config's directory. */
export function resolveConfig(config: IconmatchConfig = {}): ResolvedConfig {
  return {
    sets: config.sets ?? [createTablerAdapter()],
    buildDir: config.buildDir ?? DEFAULT_CONFIG.buildDir,
    packageDir: config.packageDir ?? DEFAULT_CONFIG.packageDir,
    enrich: { ...DEFAULT_CONFIG.enrich, ...config.enrich },
    embed: { ...DEFAULT_CONFIG.embed, ...config.embed },
  };
}

export { createTablerAdapter };
