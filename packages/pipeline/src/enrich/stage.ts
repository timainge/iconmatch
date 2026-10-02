import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogEntry, SvgArtifact } from "@iconmatch/core";
import type { EnrichmentProvider } from "./provider.js";
import {
  currentEnrichments,
  runEnrichment,
  type EnrichmentRunStats,
  type EnrichmentSelection,
  type RetryOptions,
} from "./runner.js";
import type { ModelEnrichment } from "./schema.js";

/** Enrichment text the `index` and `embed` stages consume, keyed by icon id. */
export const BUILD_ENRICHMENTS_FILE = "enrichments.json";

/**
 * One icon's enrichment in `enrichments.json`: LLM fields when an LLM mode
 * ran, and `learned` concepts from users' choices (spec §15.5) kept apart so
 * their source stays visible.
 */
export interface BuildEnrichment extends Partial<ModelEnrichment> {
  learned?: string[];
}

export type BuildEnrichments = Record<string, BuildEnrichment>;

/** What the `index` and `embed` stages see: learned concepts folded into `concepts`. */
export interface StageEnrichment {
  description?: string;
  concepts: string[];
  domains?: string[];
}

/**
 * `enrich` stage. Mode `none` writes an empty map so later stages don't pick
 * up a stale one. Mode `text` runs the provider over uncached icons, then
 * writes the cached enrichments matching the current inputs.
 */
export async function runEnrichStage(
  buildDir: string,
  options: {
    mode: "none" | "text" | "vision";
    provider?: EnrichmentProvider;
    /** Required for mode "vision". */
    visionProvider?: EnrichmentProvider;
    visionFor?: "sparse" | "all";
    cacheFile: string;
    limit?: number;
    concurrency?: number;
    retry?: RetryOptions;
    sleep?: (ms: number) => Promise<void>;
    log?: (message: string) => void;
    /** Learned concepts per icon id (spec §15.5), merged into the output. */
    learned?: ReadonlyMap<string, string[]>;
  },
): Promise<{ written: number; stats?: EnrichmentRunStats }> {
  const out = join(buildDir, BUILD_ENRICHMENTS_FILE);
  const withLearned = (map: BuildEnrichments): BuildEnrichments => {
    if (!options.learned || options.learned.size === 0) return map;
    const merged: BuildEnrichments = { ...map };
    for (const [id, concepts] of options.learned)
      merged[id] = { ...merged[id], learned: concepts };
    return Object.fromEntries(
      Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
  };
  if (options.mode === "none") {
    const map = withLearned({});
    await writeFile(out, JSON.stringify(map) + "\n");
    return { written: Object.keys(map).length };
  }
  if (!options.provider) {
    throw new Error(`enrich --mode ${options.mode} needs a text provider`);
  }
  if (options.mode === "vision" && !options.visionProvider) {
    throw new Error("enrich --mode vision needs a vision provider");
  }
  const selection: EnrichmentSelection =
    options.mode === "vision" && options.visionProvider
      ? {
          textModel: options.provider.model,
          vision: {
            model: options.visionProvider.model,
            visionFor: options.visionFor ?? "sparse",
          },
        }
      : { textModel: options.provider.model };
  const catalog = JSON.parse(
    await readFile(join(buildDir, "catalog.json"), "utf8"),
  ) as CatalogEntry[];
  const svgs = JSON.parse(
    await readFile(join(buildDir, "svgs.json"), "utf8"),
  ) as SvgArtifact;
  const stats = await runEnrichment({
    catalog,
    svgs,
    provider: options.provider,
    ...(selection.vision &&
      options.visionProvider && {
        visionProvider: options.visionProvider,
        visionFor: selection.vision.visionFor,
      }),
    cacheFile: options.cacheFile,
    ...(options.limit !== undefined && { limit: options.limit }),
    ...(options.concurrency !== undefined && {
      concurrency: options.concurrency,
    }),
    ...(options.retry && { retry: options.retry }),
    ...(options.sleep && { sleep: options.sleep }),
    ...(options.log && { log: options.log }),
  });
  const current = await currentEnrichments(
    catalog,
    svgs,
    options.cacheFile,
    selection,
  );
  const map: BuildEnrichments = {};
  for (const [id, e] of [...current].sort(([a], [b]) => (a < b ? -1 : 1))) {
    map[id] = {
      description: e.description,
      concepts: e.concepts,
      domains: e.domains,
    };
  }
  const merged = withLearned(map);
  await writeFile(out, JSON.stringify(merged) + "\n");
  return { written: Object.keys(merged).length, stats };
}

/** Reads `build/enrichments.json` if present (empty map otherwise). */
export async function readBuildEnrichments(
  buildDir: string,
): Promise<Map<string, StageEnrichment>> {
  try {
    const map = JSON.parse(
      await readFile(join(buildDir, BUILD_ENRICHMENTS_FILE), "utf8"),
    ) as BuildEnrichments;
    return new Map(
      Object.entries(map).map(([id, e]) => {
        const stage: StageEnrichment = {
          concepts: [...(e.concepts ?? []), ...(e.learned ?? [])],
        };
        if (e.description !== undefined) stage.description = e.description;
        if (e.domains !== undefined) stage.domains = e.domains;
        return [id, stage];
      }),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw e;
  }
}
