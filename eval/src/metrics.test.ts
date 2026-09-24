import { describe, expect, it } from "vitest";
import {
  compare,
  fallbackMetrics,
  firstHit,
  metrics,
  report,
  thresholdSweep,
  type QueryRun,
} from "./metrics.js";
import type { EvalQuery } from "./queries.js";

const q = (query: string, acceptable: string[], group = "g"): EvalQuery => ({
  query,
  acceptable,
  group,
  split: "dev",
});
const run = (
  query: EvalQuery,
  ranked: string[],
  topConfidence = 0.9,
): QueryRun => ({ query, ranked, topConfidence });

const runs = [
  run(q("a", ["x"], "concrete"), ["x", "y"]), // rank 1
  run(q("b", ["x"], "concrete"), ["y", "z", "x"]), // rank 3
  run(q("c", ["x", "w"], "brands"), ["y", "z", "v", "u", "w"]), // rank 5
  run(q("d", ["x"], "brands"), ["y"]), // miss
  run(q("e", [], "no-match"), ["y"], 0.3), // should fall back; does at 0.5
  run(q("f", [], "no-match"), ["y"], 0.7), // should fall back; doesn't
  run(q("g", ["y"], "concrete"), ["y"], 0.4), // hit, but falls back wrongly at 0.5
];

describe("metrics (spec §9.2)", () => {
  it("firstHit is the 1-based rank of the first acceptable id, 0 if none", () => {
    expect(runs.map(firstHit)).toEqual([1, 3, 5, 0, 0, 0, 1]);
  });

  it("Hit@k and MRR over queries with acceptable ids", () => {
    const m = metrics(runs, 0.5);
    expect(m.n).toBe(5);
    expect(m.hit1).toBeCloseTo(2 / 5, 12);
    expect(m.hit3).toBeCloseTo(3 / 5, 12);
    expect(m.hit5).toBeCloseTo(4 / 5, 12);
    expect(m.mrr).toBeCloseTo((1 + 1 / 3 + 1 / 5 + 0 + 1) / 5, 12);
  });

  it("fallback precision/recall at a threshold", () => {
    expect(fallbackMetrics(runs, 0.5)).toEqual({
      threshold: 0.5,
      precision: 0.5, // e (right), g (wrong)
      recall: 0.5, // e yes, f no
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
    });
    // No results at all counts as falling back.
    expect(fallbackMetrics([run(q("z", []), [], 0)], 0.3).recall).toBe(1);
  });

  it("breaks down per group", () => {
    const r = report(runs, 0.5);
    expect(Object.keys(r.perGroup)).toEqual(["brands", "concrete", "no-match"]);
    expect(r.perGroup.concrete?.hit1).toBeCloseTo(2 / 3, 12);
    expect(r.perGroup.brands?.hit5).toBeCloseTo(1 / 2, 12);
  });

  it("sweeps minConfidence 0.30–0.80 in 0.05 steps", () => {
    const sweep = thresholdSweep(runs);
    expect(sweep.map((s) => s.threshold)).toEqual([
      0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
    ]);
    expect(sweep.at(-1)?.recall).toBe(1);
  });
});

describe("compare (spec §9.4)", () => {
  it("flags drops beyond 0.02 in Hit@3 or MRR, not within tolerance", () => {
    const base = { hit3: 0.7, mrr: 0.6 };
    expect(
      compare("baseline", { hit3: 0.68, mrr: 0.6 }, base).map(
        (d) => d.regression,
      ),
    ).toEqual([false, false]);
    expect(
      compare("baseline", { hit3: 0.679, mrr: 0.65 }, base).map(
        (d) => d.regression,
      ),
    ).toEqual([true, false]);
    expect(
      compare("baseline", { hit3: 0.8, mrr: 0.5 }, base).map(
        (d) => d.regression,
      ),
    ).toEqual([false, true]);
  });
});
