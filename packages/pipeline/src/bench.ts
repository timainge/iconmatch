import {
  createIconMatcher,
  type DataSource,
  type Embedder,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadVectors,
} from "iconmatch";

/** Spec §7.5 targets (Node, M-series Mac). Reported, not gated. */
export const TARGETS = { warmQueryMs: 30, embeddingMs: 50 } as const;

export const BENCH_QUERIES = [
  "Dog grooming",
  "Super contributions",
  "Groceries",
  "Bike maintenance",
  "Kids' ski gear",
  "Insurance",
  "Netflix",
  "Home build",
  "Medical",
  "Misc",
];

export interface Stats {
  median: number;
  p95: number;
  max: number;
}

export function stats(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) =>
    s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] ?? 0;
  return { median: at(0.5), p95: at(0.95), max: s[s.length - 1] ?? 0 };
}

export interface BenchReport {
  icons: number;
  coldLoadMs: number;
  embedding: Stats;
  warmQuery: Stats;
  targets: typeof TARGETS;
}

/**
 * Measures cold model load, per-query embedding, and warm `search()` with
 * embedding excluded (query vectors are pre-computed and served from memory).
 */
export async function runBench(
  source: DataSource,
  embedder: Embedder,
  options: { queries?: string[]; rounds?: number; now?: () => number } = {},
): Promise<BenchReport> {
  const now = options.now ?? (() => performance.now());
  const queries = options.queries ?? BENCH_QUERIES;
  const rounds = options.rounds ?? 20;
  const manifest = await loadManifest(source);
  const [catalog, keywordIndex, vectors] = await Promise.all([
    loadCatalog(source, { manifest }),
    loadKeywordIndex(source, { manifest }),
    loadVectors(source, manifest),
  ]);

  let t = now();
  await embedder.embed([queries[0] ?? "warm up"], "query");
  const coldLoadMs = now() - t;

  const cache = new Map<string, Float32Array>();
  const embedTimes: number[] = [];
  for (let r = 0; r < rounds; r++) {
    for (const q of queries) {
      t = now();
      const [v] = await embedder.embed([q], "query");
      embedTimes.push(now() - t);
      if (v) cache.set(q, v);
    }
  }

  const cached: Embedder = {
    modelId: embedder.modelId,
    embed: (texts) =>
      Promise.resolve(
        texts.map((x) => cache.get(x) ?? new Float32Array(vectors.dims)),
      ),
  };
  const matcher = await createIconMatcher({
    catalog,
    keywordIndex,
    vectors,
    embedder: cached,
    manifest,
  });
  for (const q of queries) await matcher.search(q); // JIT warm-up
  const queryTimes: number[] = [];
  for (let r = 0; r < rounds; r++) {
    for (const q of queries) {
      t = now();
      await matcher.search(q, { limit: 20 });
      queryTimes.push(now() - t);
    }
  }
  return {
    icons: catalog.length,
    coldLoadMs,
    embedding: stats(embedTimes),
    warmQuery: stats(queryTimes),
    targets: TARGETS,
  };
}

export function formatReport(r: BenchReport): string {
  const ms = (n: number) => `${n.toFixed(1)} ms`;
  const row = (name: string, s: Stats, target: number) =>
    `| ${name} | ${ms(s.median)} | ${ms(s.p95)} | ${ms(s.max)} | ≤ ${String(target)} ms | ${s.p95 <= target ? "ok" : "over"} |`;
  return [
    `iconmatch bench: ${String(r.icons)} icons (reported, not gated)`,
    "",
    "| measure | median | p95 | max | target | p95 vs target |",
    "| --- | --- | --- | --- | --- | --- |",
    row("warm query (excl. embedding)", r.warmQuery, r.targets.warmQueryMs),
    row("query embedding", r.embedding, r.targets.embeddingMs),
    `| cold model load | ${ms(r.coldLoadMs)} | | | not gated | |`,
  ].join("\n");
}
