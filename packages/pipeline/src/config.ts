import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_EMBEDDING_MODEL } from "@iconmatch/core";
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
    /**
     * Where enrichment feeds the search (spec §15.5): the keyword index and
     * the embedded document text (`both`, v0.1 behaviour), or only one.
     */
    applyTo?: "both" | "index" | "embed";
    /**
     * Learned concepts (spec §15.5): a JSON file holding an array of users'
     * choice exports (`ChoiceMemory.export()`). Empty for none.
     */
    learnedFrom?: string;
    /** Distinct users who must agree on a choice for it to become a concept. Default 2. */
    learnedMinUsers?: number;
  };
  embed?: {
    model?: string;
    quantisation?: "int8" | "float32";
    /** Hub id (default), mirror URL or local directory (spec §7.5). */
    modelLocation?: string;
    localOnly?: boolean;
    /** Model download cache; default `~/.cache/iconmatch/models`. */
    cacheDir?: string;
  };
}

export interface ResolvedConfig {
  sets: IconSetAdapter[];
  buildDir: string;
  packageDir: string;
  enrich: Required<NonNullable<IconmatchConfig["enrich"]>>;
  embed: Required<
    Pick<
      NonNullable<IconmatchConfig["embed"]>,
      "model" | "quantisation" | "localOnly" | "cacheDir"
    >
  > &
    Pick<NonNullable<IconmatchConfig["embed"]>, "modelLocation">;
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
    applyTo: "both",
    learnedFrom: "",
    learnedMinUsers: 2,
  },
  embed: {
    model: DEFAULT_EMBEDDING_MODEL,
    quantisation: "int8",
    localOnly: false,
    cacheDir: join(homedir(), ".cache", "iconmatch", "models"),
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
export { createLucideAdapter } from "./adapters/lucide.js";
export { createGeneratedAdapter } from "./adapters/generated.js";
export { subsetAdapter } from "./adapters/subset.js";
