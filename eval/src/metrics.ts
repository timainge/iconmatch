import type { EvalQuery } from "./queries.js";

/** What the matcher returned for one query. */
export interface QueryRun {
  query: EvalQuery;
  /** `search()` ids, best first. */
  ranked: string[];
  /** Top search result's confidence (0 if none). `best()` falls back below `minConfidence`. */
  topConfidence: number;
}

export interface Metrics {
  /** Queries with acceptable ids (Hit@k and MRR are over these). */
  n: number;
  hit1: number;
  hit3: number;
  hit5: number;
  mrr: number;
  fallback: FallbackMetrics;
}

export interface FallbackMetrics {
  threshold: number;
  /** Of the queries where `best()` fell back, the share that should have. */
  precision: number;
  /** Of the queries that should fall back, the share that did. */
  recall: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface Report extends Metrics {
  perGroup: Record<string, Metrics>;
}

/** Rank (1-based) of the first acceptable id, or 0. */
export function firstHit(run: QueryRun): number {
  const i = run.ranked.findIndex((id) => run.query.acceptable.includes(id));
  return i + 1;
}

export function fallbackMetrics(
  runs: QueryRun[],
  threshold: number,
): FallbackMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const r of runs) {
    const fellBack = r.ranked.length === 0 || r.topConfidence < threshold;
    const shouldFallBack = r.query.acceptable.length === 0;
    if (fellBack && shouldFallBack) tp++;
    else if (fellBack) fp++;
    else if (shouldFallBack) fn++;
  }
  // No fallbacks at all: precision is vacuously 1.
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return {
    threshold,
    precision,
    recall,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
  };
}

/** Spec §9.2 metrics. */
export function metrics(runs: QueryRun[], threshold: number): Metrics {
  const scored = runs.filter((r) => r.query.acceptable.length > 0);
  const n = scored.length;
  const ranks = scored.map(firstHit);
  const share = (k: number) =>
    n === 0 ? 0 : ranks.filter((r) => r > 0 && r <= k).length / n;
  const mrr =
    n === 0 ? 0 : ranks.reduce((s, r) => s + (r > 0 ? 1 / r : 0), 0) / n;
  return {
    n,
    hit1: share(1),
    hit3: share(3),
    hit5: share(5),
    mrr,
    fallback: fallbackMetrics(runs, threshold),
  };
}

export function report(runs: QueryRun[], threshold: number): Report {
  const groups = [...new Set(runs.map((r) => r.query.group))].sort();
  return {
    ...metrics(runs, threshold),
    perGroup: Object.fromEntries(
      groups.map((g) => [
        g,
        metrics(
          runs.filter((r) => r.query.group === g),
          threshold,
        ),
      ]),
    ),
  };
}

/** `minConfidence` sweep 0.30–0.80 step 0.05 (spec §9.3). */
export function thresholdSweep(runs: QueryRun[]): FallbackMetrics[] {
  return Array.from({ length: 11 }, (_, i) =>
    fallbackMetrics(runs, Math.round((0.3 + i * 0.05) * 100) / 100),
  );
}

/** Allowed drop in dev Hit@3 or MRR before `--compare` fails (spec §9.4). */
export const REGRESSION_TOLERANCE = 0.02;

export interface Delta {
  config: string;
  metric: "hit3" | "mrr";
  baseline: number;
  current: number;
  delta: number;
  regression: boolean;
}

export function compare(
  config: string,
  current: Pick<Metrics, "hit3" | "mrr">,
  baseline: Pick<Metrics, "hit3" | "mrr">,
): Delta[] {
  return (["hit3", "mrr"] as const).map((metric) => {
    const delta = current[metric] - baseline[metric];
    return {
      config,
      metric,
      baseline: baseline[metric],
      current: current[metric],
      delta,
      regression: delta < -REGRESSION_TOLERANCE - 1e-12,
    };
  });
}
