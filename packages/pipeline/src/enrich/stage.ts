import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogEntry, SvgArtifact } from "iconmatch";
import type { EnrichmentProvider } from "./provider.js";
import {
  currentEnrichments,
  runEnrichment,
  type EnrichmentRunStats,
  type RetryOptions,
} from "./runner.js";
import type { ModelEnrichment } from "./schema.js";

/** Enrichment text the `index` and `embed` stages consume, keyed by icon id. */
export const BUILD_ENRICHMENTS_FILE = "enrichments.json";

export type BuildEnrichments = Record<string, ModelEnrichment>;

/**
 * `enrich` stage. Mode `none` writes an empty map so later stages don't pick
 * up a stale one. Mode `text` runs the provider over uncached icons, then
 * writes the cached enrichments matching the current inputs.
 */
export async function runEnrichStage(
  buildDir: string,
  options: {
    mode: "none" | "text";
    provider?: EnrichmentProvider;
    cacheFile: string;
    limit?: number;
    concurrency?: number;
    retry?: RetryOptions;
    sleep?: (ms: number) => Promise<void>;
    log?: (message: string) => void;
  },
): Promise<{ written: number; stats?: EnrichmentRunStats }> {
  const out = join(buildDir, BUILD_ENRICHMENTS_FILE);
  if (options.mode === "none") {
    await writeFile(out, "{}\n");
    return { written: 0 };
  }
  if (!options.provider) throw new Error("enrich --mode text needs a provider");
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
    options.provider.model,
  );
  const map: BuildEnrichments = {};
  for (const [id, e] of [...current].sort(([a], [b]) => (a < b ? -1 : 1))) {
    map[id] = {
      description: e.description,
      concepts: e.concepts,
      domains: e.domains,
    };
  }
  await writeFile(out, JSON.stringify(map) + "\n");
  return { written: current.size, stats };
}

/** Reads `build/enrichments.json` if present (empty map otherwise). */
export async function readBuildEnrichments(
  buildDir: string,
): Promise<Map<string, ModelEnrichment>> {
  try {
    const map = JSON.parse(
      await readFile(join(buildDir, BUILD_ENRICHMENTS_FILE), "utf8"),
    ) as BuildEnrichments;
    return new Map(Object.entries(map));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw e;
  }
}
