import type { Judgement } from "../../packages/pipeline/src/judge/judge.js";
import type { EvalQuery } from "./queries.js";

/** Agreement of the vision judge with the human labels (spec §15.6). */
export interface Agreement {
  /** Judged (query, icon) pairs. */
  n: number;
  accuracy: number;
  /** Cohen's κ between judge "fits" and human "acceptable". */
  kappa: number;
  /** Of the pairs the judge said fit, the share humans accept. */
  precision: number;
  /** Of the pairs humans accept, the share the judge said fit. */
  recall: number;
  /** Counts: [judge fits & human yes, judge fits & human no, judge no & human yes, judge no & human no]. */
  confusion: [number, number, number, number];
}

export function agreement(
  pairs: { judgeFits: boolean; humanFits: boolean }[],
): Agreement {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const p of pairs) {
    if (p.judgeFits && p.humanFits) tp++;
    else if (p.judgeFits) fp++;
    else if (p.humanFits) fn++;
    else tn++;
  }
  const n = pairs.length;
  const po = n === 0 ? 0 : (tp + tn) / n;
  // Chance agreement from the marginals.
  const pe =
    n === 0
      ? 0
      : ((tp + fp) / n) * ((tp + fn) / n) + ((fn + tn) / n) * ((fp + tn) / n);
  return {
    n,
    accuracy: po,
    kappa: pe === 1 ? 1 : (po - pe) / (1 - pe),
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    confusion: [tp, fp, fn, tn],
  };
}

export interface JudgeEvalResult {
  model: string;
  promptVersion: string;
  /** Candidates judged per query (the hybrid matcher's top k). */
  topK: number;
  overall: Agreement;
  bySplit: Record<string, Agreement>;
  byGroup: Record<string, Agreement>;
  /** Confident disagreements, for the human (never applied). */
  disagreements: {
    query: string;
    iconId: string;
    rank: number;
    split: string;
    humanFits: boolean;
    judgeFits: boolean;
    confidence: number;
    reason: string;
  }[];
  failed: number;
}

/** Joins judgements with the labels and computes agreement. */
export function judgeEval(options: {
  queries: EvalQuery[];
  /** The candidates judged per query, best first. */
  candidates: Map<string, string[]>;
  judgements: Judgement[];
  topK: number;
  failed: number;
  /** Judge confidence needed to list a disagreement. Default 0.8. */
  minConfidence?: number;
}): JudgeEvalResult {
  const byKey = new Map(
    options.judgements.map((j) => [`${j.query}\u0000${j.iconId}`, j]),
  );
  const rows = options.queries.flatMap((q) =>
    (options.candidates.get(q.query) ?? []).flatMap((iconId, i) => {
      const j = byKey.get(`${q.query}\u0000${iconId}`);
      return j
        ? [
            {
              q,
              j,
              rank: i + 1,
              judgeFits: j.fits,
              humanFits: q.acceptable.includes(iconId),
            },
          ]
        : [];
    }),
  );
  const groupBy = (key: (r: (typeof rows)[number]) => string) => {
    const out: Record<string, Agreement> = {};
    for (const k of [...new Set(rows.map(key))].sort())
      out[k] = agreement(rows.filter((r) => key(r) === k));
    return out;
  };
  const first = options.judgements[0];
  return {
    model: first?.model ?? "",
    promptVersion: first?.promptVersion ?? "",
    topK: options.topK,
    overall: agreement(rows),
    bySplit: groupBy((r) => r.q.split),
    byGroup: groupBy((r) => r.q.group),
    disagreements: rows
      .filter(
        (r) =>
          r.judgeFits !== r.humanFits &&
          r.j.confidence >= (options.minConfidence ?? 0.8),
      )
      .sort((a, b) => b.j.confidence - a.j.confidence || a.rank - b.rank)
      .map((r) => ({
        query: r.q.query,
        iconId: r.j.iconId,
        rank: r.rank,
        split: r.q.split,
        humanFits: r.humanFits,
        judgeFits: r.judgeFits,
        confidence: r.j.confidence,
        reason: r.j.reason,
      })),
    failed: options.failed,
  };
}

const f = (n: number) => n.toFixed(3);

export function judgeEvalMarkdown(
  r: JudgeEvalResult,
  meta: { date: string; reviewed: boolean },
): string {
  const head = [
    "| set | pairs | accuracy | κ | precision (fits) | recall (fits) | judge fits & human yes / no | judge no & human yes / no |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const row = (label: string, a: Agreement) =>
    `| ${label} | ${String(a.n)} | ${f(a.accuracy)} | ${f(a.kappa)} | ${f(a.precision)} | ${f(a.recall)} | ${String(a.confusion[0])} / ${String(a.confusion[1])} | ${String(a.confusion[2])} / ${String(a.confusion[3])} |`;
  return (
    [
      `# Vision judge agreement ${meta.date}`,
      "",
      `Spec §15.6. Judge \`${r.model}\` (prompt \`${r.promptVersion}\`) sees each candidate rendered at 256×256 with the category name only (not the icon's name or tags), and answers whether a typical user would accept it. Candidates: the hybrid matcher's top ${String(r.topK)} for every query of the ${meta.reviewed ? "reviewed" : "unreviewed"} eval set; "human yes" means the icon is in the query's acceptable labels.${r.failed > 0 ? ` ${String(r.failed)} pairs failed to judge and are left out.` : ""}`,
      "",
      "## Agreement",
      "",
      ...head,
      row("all", r.overall),
      ...Object.entries(r.bySplit).map(([k, a]) => row(k, a)),
      "",
      "## By group",
      "",
      ...head,
      ...Object.entries(r.byGroup).map(([k, a]) => row(k, a)),
      "",
      "## Confident disagreements (judge confidence ≥ 0.8)",
      "",
      'Suggestions for the label owner, never applied automatically. "Judge fits, human no" may be a missing acceptable label; "judge no, human yes" may be a loose label or a judge miss.',
      "",
      "| query | split | icon (rank) | human | judge | conf. | judge's reason |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...r.disagreements.map(
        (d) =>
          `| ${d.query} | ${d.split} | \`${d.iconId}\` (${String(d.rank)}) | ${d.humanFits ? "yes" : "no"} | ${d.judgeFits ? "fits" : "no"} | ${d.confidence.toFixed(2)} | ${d.reason.replace(/\|/g, "/")} |`,
      ),
    ].join("\n") + "\n"
  );
}
