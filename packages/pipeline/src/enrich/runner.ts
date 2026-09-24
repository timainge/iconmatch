import type { CatalogEntry, SvgArtifact, SvgBody } from "iconmatch";
import { renderPng } from "../render.js";
import { appendEnrichment, readEnrichmentCache } from "./cache.js";
import { PROMPT_VERSION, VISION_PROMPT_VERSION } from "./prompts.js";
import { ProviderError, type EnrichmentProvider } from "./provider.js";
import type { Enrichment } from "./schema.js";
import { enrichText, inputHash } from "./text.js";
import { enrichVision, needsVision } from "./vision.js";

export interface RetryOptions {
  /** Attempts per icon for retryable provider errors. Default 5. */
  maxAttempts?: number;
  /** First backoff delay; doubles each retry. Default 1000 ms. */
  baseDelayMs?: number;
}

/** Which enrichment each icon should have: text for all, or vision for some (spec §6.3). */
export interface EnrichmentSelection {
  textModel: string;
  vision?: { model: string; visionFor: "sparse" | "all" };
}

export interface RunEnrichmentOptions {
  catalog: CatalogEntry[];
  svgs: SvgArtifact;
  /** Text model provider. */
  provider: EnrichmentProvider;
  /** Vision model provider; enables vision mode. */
  visionProvider?: EnrichmentProvider;
  /** With a vision provider: "sparse" (default) or "all". */
  visionFor?: "sparse" | "all";
  cacheFile: string;
  /** Process at most N uncached icons (smoke tests). */
  limit?: number;
  /** Parallel requests. Default 2 (spec §6.3). */
  concurrency?: number;
  retry?: RetryOptions;
  sleep?: (ms: number) => Promise<void>;
  render?: (svg: SvgBody) => Buffer;
  log?: (message: string) => void;
}

export interface EnrichmentRunStats {
  eligible: number;
  cached: number;
  enriched: number;
  /** Of `enriched`, how many used the vision model. */
  vision: number;
  failed: { id: string; error: string }[];
  skippedByLimit: number;
}

/** Enrichment runs once per base concept; glyphs only serve the fallback, so they're skipped. */
export function eligibleForEnrichment(entry: CatalogEntry): boolean {
  return entry.glyph === undefined;
}

function defaultSvg(
  entry: CatalogEntry,
  svgs: SvgArtifact,
): SvgBody | undefined {
  return svgs[entry.id]?.[entry.variants[0] ?? "outline"];
}

export function hashFor(
  entry: CatalogEntry,
  svgs: SvgArtifact,
  model: string,
  promptVersion = PROMPT_VERSION,
): string {
  return inputHash(
    defaultSvg(entry, svgs)?.body ?? "",
    entry.tags,
    promptVersion,
    model,
  );
}

/** Text or vision for this icon, and the cache key that goes with it. */
export function planFor(
  entry: CatalogEntry,
  svgs: SvgArtifact,
  selection: EnrichmentSelection,
): { mode: "text" | "vision"; hash: string } {
  const v = selection.vision;
  if (v && (v.visionFor === "all" || needsVision(entry))) {
    return {
      mode: "vision",
      hash: hashFor(entry, svgs, v.model, VISION_PROMPT_VERSION),
    };
  }
  return { mode: "text", hash: hashFor(entry, svgs, selection.textModel) };
}

/** Calls `fn`, retrying retryable ProviderErrors with exponential backoff. */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  retry: RetryOptions,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  const max = retry.maxAttempts ?? 5;
  const base = retry.baseDelayMs ?? 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ProviderError) || !e.retryable || attempt >= max)
        throw e;
      await sleep(base * 2 ** (attempt - 1));
    }
  }
}

function selectionOf(
  options: Pick<
    RunEnrichmentOptions,
    "provider" | "visionProvider" | "visionFor"
  >,
): EnrichmentSelection {
  return options.visionProvider
    ? {
        textModel: options.provider.model,
        vision: {
          model: options.visionProvider.model,
          visionFor: options.visionFor ?? "sparse",
        },
      }
    : { textModel: options.provider.model };
}

/**
 * Enriches every eligible icon whose planned cache entry is missing,
 * appending each result as it arrives. Failures are collected, not fatal.
 */
export async function runEnrichment(
  options: RunEnrichmentOptions,
): Promise<EnrichmentRunStats> {
  const sleep =
    options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const render = options.render ?? ((svg: SvgBody) => renderPng(svg));
  const selection = selectionOf(options);
  const { byHash } = await readEnrichmentCache(options.cacheFile);
  const eligible = options.catalog.filter(eligibleForEnrichment);
  const todo = eligible
    .map((entry) => ({ entry, plan: planFor(entry, options.svgs, selection) }))
    .filter((t) => !byHash.has(t.plan.hash));
  const batch =
    options.limit === undefined ? todo : todo.slice(0, options.limit);
  const stats: EnrichmentRunStats = {
    eligible: eligible.length,
    cached: eligible.length - todo.length,
    enriched: 0,
    vision: 0,
    failed: [],
    skippedByLimit: todo.length - batch.length,
  };

  let next = 0;
  const worker = async () => {
    for (let i = next++; i < batch.length; i = next++) {
      const item = batch[i];
      if (!item) continue;
      const { entry, plan } = item;
      const svg = defaultSvg(entry, options.svgs);
      try {
        const run =
          plan.mode === "vision" && options.visionProvider && svg
            ? () =>
                enrichVision(
                  options.visionProvider as EnrichmentProvider,
                  entry,
                  svg.body,
                  render(svg),
                )
            : () => enrichText(options.provider, entry, svg?.body ?? "");
        const e = await withBackoff(run, options.retry ?? {}, sleep);
        await appendEnrichment(options.cacheFile, e);
        stats.enriched++;
        if (e.mode === "vision") stats.vision++;
      } catch (err) {
        stats.failed.push({ id: entry.id, error: (err as Error).message });
      }
      const done = stats.enriched + stats.failed.length;
      if (done % 25 === 0 || done === batch.length) {
        options.log?.(
          `enrich: ${String(done)}/${String(batch.length)} (${String(stats.failed.length)} failed)`,
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, options.concurrency ?? 2) }, worker),
  );
  return stats;
}

/** The cached enrichments matching the current catalog and selection (text model, or text + vision). */
export async function currentEnrichments(
  catalog: CatalogEntry[],
  svgs: SvgArtifact,
  cacheFile: string,
  selection: EnrichmentSelection | string,
): Promise<Map<string, Enrichment>> {
  const sel =
    typeof selection === "string" ? { textModel: selection } : selection;
  const { byHash } = await readEnrichmentCache(cacheFile);
  const out = new Map<string, Enrichment>();
  for (const entry of catalog.filter(eligibleForEnrichment)) {
    const e = byHash.get(planFor(entry, svgs, sel).hash);
    if (e) out.set(entry.id, e);
  }
  return out;
}
