import { describe, expect, it } from "vitest";
import type { Judgement } from "../../packages/pipeline/src/judge/judge.js";
import { agreement, judgeEval, judgeEvalMarkdown } from "./judge-eval.js";
import type { EvalQuery } from "./queries.js";

describe("agreement (spec §15.6)", () => {
  it("computes accuracy, Cohen's κ and precision/recall of 'fits'", () => {
    // 20 judge-yes/human-yes, 5 judge-yes/human-no, 10 judge-no/human-yes, 15 both no.
    const pairs = [
      ...Array.from({ length: 20 }, () => ({
        judgeFits: true,
        humanFits: true,
      })),
      ...Array.from({ length: 5 }, () => ({
        judgeFits: true,
        humanFits: false,
      })),
      ...Array.from({ length: 10 }, () => ({
        judgeFits: false,
        humanFits: true,
      })),
      ...Array.from({ length: 15 }, () => ({
        judgeFits: false,
        humanFits: false,
      })),
    ];
    const a = agreement(pairs);
    expect(a.accuracy).toBeCloseTo(0.7, 10);
    // pe = 0.5*0.6 + 0.5*0.4 = 0.5, so κ = (0.7-0.5)/0.5 = 0.4.
    expect(a.kappa).toBeCloseTo(0.4, 10);
    expect(a.precision).toBeCloseTo(0.8, 10);
    expect(a.recall).toBeCloseTo(20 / 30, 10);
    expect(a.confusion).toEqual([20, 5, 10, 15]);
  });
});

const j = (
  query: string,
  iconId: string,
  fits: boolean,
  confidence = 0.9,
): Judgement => ({
  query,
  iconId,
  fits,
  confidence,
  reason: `${iconId} ${fits ? "fits" : "does not fit"}`,
  model: "m",
  promptVersion: "judge-v1",
  hash: `${query}/${iconId}`,
});

describe("judgeEval", () => {
  const queries: EvalQuery[] = [
    {
      query: "Dog grooming",
      acceptable: ["t:dog"],
      group: "concrete",
      split: "dev",
    },
    { query: "Pottery", acceptable: [], group: "no-match", split: "test" },
  ];
  const candidates = new Map([
    ["Dog grooming", ["t:dog", "t:razor"]],
    ["Pottery", ["t:plant"]],
  ]);

  it("joins judgements with labels, splits by split and group, and lists confident disagreements", () => {
    const r = judgeEval({
      queries,
      candidates,
      judgements: [
        j("Dog grooming", "t:dog", true),
        j("Dog grooming", "t:razor", true, 0.85),
        j("Pottery", "t:plant", false, 0.6),
      ],
      topK: 2,
      failed: 0,
    });
    expect(r.overall.confusion).toEqual([1, 1, 0, 1]);
    expect(Object.keys(r.bySplit)).toEqual(["dev", "test"]);
    expect(Object.keys(r.byGroup)).toEqual(["concrete", "no-match"]);
    expect(r.disagreements).toEqual([
      expect.objectContaining({
        query: "Dog grooming",
        iconId: "t:razor",
        rank: 2,
        humanFits: false,
        judgeFits: true,
      }),
    ]);
    const md = judgeEvalMarkdown(r, { date: "2026-10-03", reviewed: true });
    expect(md).toContain("# Vision judge agreement 2026-10-03");
    expect(md).toContain(
      "| Dog grooming | dev | `t:razor` (2) | no | fits | 0.85 |",
    );
  });
});
