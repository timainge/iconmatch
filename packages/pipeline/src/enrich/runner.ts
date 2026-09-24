import type { CatalogEntry, SvgArtifact } from "iconmatch";
import { appendEnrichment, readEnrichmentCache } from "./cache.js";
import { PROMPT_VERSION } from "./prompts.js";
import { ProviderError, type EnrichmentProvider } from "./provider.js";
import type { Enrichment } from "./schema.js";
import { enrichText, inputHash } from "./text.js";

export interface RetryOptions {
  /** Attempts per icon for retryable provider errors. Default 5. */
  maxAttempts?: number;
  /** First backoff delay; doubles each retry. Default 1000 ms. */
  baseDelayMs?: number;
}

export interface RunEnrichmentOptions {
  catalog: CatalogEntry[];
  svgs: SvgArtifact;
  provider: EnrichmentProvider;
  cacheFile: string;
  /** Process at most N uncached icons (smoke tests). */
  limit?: number;
  /** Parallel requests. Default 2 (spec §6.3). */
  concurrency?: number;
  retry?: RetryOptions;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export interface EnrichmentRunStats {
  eligible: number;
  cached: number;
  enriched: number;
  failed: { id: string; error: string }[];
  skippedByLimit: number;
}

/** Enrichment runs once per base concept; glyphs only serve the fallback, so they're skipped. */
export function eligibleForEnrichment(entry: CatalogEntry): boolean {
  return entry.glyph === undefined;
}

export function hashFor(
  entry: CatalogEntry,
  svgs: SvgArtifact,
  model: string,
  promptVersion = PROMPT_VERSION,
): string {
  const variant = entry.variants[0] ?? "outline";
  return inputHash(
    svgs[entry.id]?.[variant]?.body ?? "",
    entry.tags,
    promptVersion,
    model,
  );
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

/**
 * Text-enriches every eligible icon not already in the cache (by inputHash),
 * appending each result as it arrives. Failures are collected, not fatal.
 */
export async function runEnrichment(
  options: RunEnrichmentOptions,
): Promise<EnrichmentRunStats> {
  const sleep =
    options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const { byHash } = await readEnrichmentCache(options.cacheFile);
  const eligible = options.catalog.filter(eligibleForEnrichment);
  const todo = eligible.filter(
    (e) => !byHash.has(hashFor(e, options.svgs, options.provider.model)),
  );
  const batch =
    options.limit === undefined ? todo : todo.slice(0, options.limit);
  const stats: EnrichmentRunStats = {
    eligible: eligible.length,
    cached: eligible.length - todo.length,
    enriched: 0,
    failed: [],
    skippedByLimit: todo.length - batch.length,
  };

  let next = 0;
  const worker = async () => {
    for (let i = next++; i < batch.length; i = next++) {
      const entry = batch[i];
      if (!entry) continue;
      const body =
        options.svgs[entry.id]?.[entry.variants[0] ?? "outline"]?.body ?? "";
      try {
        const e = await withBackoff(
          () => enrichText(options.provider, entry, body),
          options.retry ?? {},
          sleep,
        );
        await appendEnrichment(options.cacheFile, e);
        stats.enriched++;
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

/** The cached enrichments matching the current catalog, model and prompt version. */
export async function currentEnrichments(
  catalog: CatalogEntry[],
  svgs: SvgArtifact,
  cacheFile: string,
  model: string,
): Promise<Map<string, Enrichment>> {
  const { byHash } = await readEnrichmentCache(cacheFile);
  const out = new Map<string, Enrichment>();
  for (const entry of catalog.filter(eligibleForEnrichment)) {
    const e = byHash.get(hashFor(entry, svgs, model));
    if (e) out.set(entry.id, e);
  }
  return out;
}
