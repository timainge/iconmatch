import {
  createChoiceMemory,
  createIconMatcher,
  DEFAULT_MIN_CONFIDENCE,
  type ChoiceEntry,
  type IconMatcherParts,
} from "@iconmatch/core";
import { readFile } from "node:fs/promises";
import type { EvalQuery } from "./queries.js";

/** One paraphrase of a dev query (spec §15.4 eval (b)). */
export interface Paraphrase {
  original: string;
  paraphrase: string;
  group: string;
  /** The original's acceptable ids: the paraphrase names the same category. */
  acceptable: string[];
  /** "tune" chooses `choiceSimilarity`; "report" is held out. */
  part: "tune" | "report";
}

export async function readParaphrases(file: string): Promise<Paraphrase[]> {
  return (JSON.parse(await readFile(file, "utf8")) as { items: Paraphrase[] })
    .items;
}

type Parts = Required<
  Pick<IconMatcherParts, "catalog" | "keywordIndex" | "vectors" | "embedder">
>;

export interface RankMetrics {
  n: number;
  hit1: number;
  hit3: number;
  mrr: number;
}

export interface ChoiceEvalResult {
  /** (a) Exact repeats whose remembered icon comes back first. */
  exactRepeatTop1: number;
  exactRepeats: number;
  /**
   * Tuning, dev only: the memory holds the tune half's choices. Per
   * threshold, the tune half's paraphrases (gain) and the report half's
   * original queries, unseen by that memory (harm).
   */
  tuning: {
    paraphrasesNone: RankMetrics;
    unseenNone: RankMetrics;
    byThreshold: Record<
      string,
      { paraphrases: RankMetrics; unseen: RankMetrics }
    >;
  };
  /**
   * Best tune-half paraphrase MRR whose unseen dev queries lose at most
   * `tolerance` Hit@3 and MRR (ties: higher threshold).
   */
  chosenThreshold: number;
  tolerance: number;
  /** Reporting: the memory holds every dev choice. */
  report: {
    /** (b) Held-out paraphrases. */
    paraphrases: { none: RankMetrics; withMemory: RankMetrics };
    /** (c) Queries never remembered (test split). */
    unrelated: {
      none: RankMetrics & { fallbackRecall: number };
      withMemory: RankMetrics & { fallbackRecall: number };
    };
  };
}

/** The icon a user would most plausibly have picked for a query. */
export const chosenFor = (q: Pick<EvalQuery, "ideal" | "acceptable">) =>
  q.ideal ?? q.acceptable[0];

function rankMetrics(
  runs: { ranked: string[]; acceptable: string[] }[],
): RankMetrics {
  let hit1 = 0;
  let hit3 = 0;
  let rr = 0;
  for (const r of runs) {
    const i = r.ranked.findIndex((id) => r.acceptable.includes(id));
    if (i === 0) hit1++;
    if (i >= 0 && i < 3) hit3++;
    if (i >= 0) rr += 1 / (i + 1);
  }
  const n = runs.length || 1;
  return { n: runs.length, hit1: hit1 / n, hit3: hit3 / n, mrr: rr / n };
}

/**
 * Spec §15.4 eval: (a) exact repeats, (b) generalisation to paraphrases with a
 * `choiceSimilarity` sweep (tuned on the "tune" half, reported on the rest),
 * (c) no harm to queries the memory has never seen.
 */
export async function runChoiceEval(options: {
  parts: Parts;
  /** Queries whose choices are remembered (dev queries with acceptable ids). */
  remembered: EvalQuery[];
  paraphrases: Paraphrase[];
  /** Queries never remembered, for the no-regression report (test split). */
  unrelated: EvalQuery[];
  thresholds: number[];
  minConfidence?: number;
  /** Allowed Hit@3/MRR drop on unseen dev queries when tuning. Default 0.02 (spec §9.4). */
  tolerance?: number;
}): Promise<ChoiceEvalResult> {
  const { parts } = options;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const tolerance = options.tolerance ?? 0.02;
  type Matcher = Awaited<ReturnType<typeof createIconMatcher>>;

  const tunePart = new Set(
    options.paraphrases.filter((p) => p.part === "tune").map((p) => p.original),
  );
  /** Records each query's choice (embedding it) and returns the memory's entries. */
  const remember = async (queries: EvalQuery[]): Promise<ChoiceEntry[]> => {
    const memory = createChoiceMemory();
    const m = await createIconMatcher({ ...parts, choices: memory });
    for (const q of queries) {
      const id = chosenFor(q);
      if (id) await m.recordChoice(q.query, id);
    }
    return memory.export();
  };
  const withMemory = (saved: ChoiceEntry[], choiceSimilarity: number) =>
    createIconMatcher({
      ...parts,
      choices: createChoiceMemory(saved),
      choiceSimilarity,
    });
  const plain = await createIconMatcher({ ...parts });
  const rank = async (
    m: Matcher,
    items: { query: string; acceptable: string[] }[],
  ) =>
    rankMetrics(
      await Promise.all(
        items.map(async (p) => ({
          ranked: (await m.search(p.query, { limit: 50 })).map((r) => r.id),
          acceptable: p.acceptable,
        })),
      ),
    );
  const asItems = (ps: Paraphrase[]) =>
    ps.map((p) => ({ query: p.paraphrase, acceptable: p.acceptable }));

  // Tuning on dev only.
  const tuneSaved = await remember(
    options.remembered.filter((q) => tunePart.has(q.query)),
  );
  const tuneParaphrases = asItems(
    options.paraphrases.filter((p) => p.part === "tune"),
  );
  const unseenDev = options.remembered.filter((q) => !tunePart.has(q.query));
  const tuning: ChoiceEvalResult["tuning"] = {
    paraphrasesNone: await rank(plain, tuneParaphrases),
    unseenNone: await rank(plain, unseenDev),
    byThreshold: {},
  };
  for (const t of options.thresholds) {
    const m = await withMemory(tuneSaved, t);
    tuning.byThreshold[t.toFixed(2)] = {
      paraphrases: await rank(m, tuneParaphrases),
      unseen: await rank(m, unseenDev),
    };
  }
  const allowed = (t: number) => {
    const u = tuning.byThreshold[t.toFixed(2)]?.unseen;
    return (
      u !== undefined &&
      u.hit3 >= tuning.unseenNone.hit3 - tolerance - 1e-9 &&
      u.mrr >= tuning.unseenNone.mrr - tolerance - 1e-9
    );
  };
  const candidates = options.thresholds.filter(allowed);
  let chosenThreshold = Math.max(...options.thresholds);
  for (const t of candidates) {
    const a = tuning.byThreshold[t.toFixed(2)]?.paraphrases.mrr ?? -1;
    const b =
      tuning.byThreshold[chosenThreshold.toFixed(2)]?.paraphrases.mrr ?? -1;
    if (!allowed(chosenThreshold) || a > b || (a === b && t > chosenThreshold))
      chosenThreshold = t;
  }

  // Reporting with every dev choice remembered.
  const allSaved = await remember(options.remembered);
  const reportMatcher = await withMemory(allSaved, chosenThreshold);
  let exactTop1 = 0;
  const exactMatcher = await withMemory(allSaved, 1.01);
  for (const q of options.remembered) {
    const [top] = await exactMatcher.search(q.query, { limit: 1 });
    if (top?.id === chosenFor(q)) exactTop1++;
  }
  const reportParaphrases = asItems(
    options.paraphrases.filter((p) => p.part === "report"),
  );
  const unrelatedRuns = async (m: Matcher) => {
    const runs = await Promise.all(
      options.unrelated.map(async (q) => {
        const results = await m.search(q.query, { limit: 50 });
        return {
          ranked: results.map((r) => r.id),
          acceptable: q.acceptable,
          fellBack: !((results[0]?.confidence ?? 0) >= minConfidence),
        };
      }),
    );
    const fallbacks = runs.filter((r) => r.acceptable.length === 0);
    return {
      ...rankMetrics(runs.filter((r) => r.acceptable.length > 0)),
      fallbackRecall:
        fallbacks.filter((r) => r.fellBack).length / (fallbacks.length || 1),
    };
  };
  return {
    exactRepeatTop1: exactTop1 / (options.remembered.length || 1),
    exactRepeats: options.remembered.length,
    tuning,
    chosenThreshold,
    tolerance,
    report: {
      paraphrases: {
        none: await rank(plain, reportParaphrases),
        withMemory: await rank(reportMatcher, reportParaphrases),
      },
      unrelated: {
        none: await unrelatedRuns(plain),
        withMemory: await unrelatedRuns(reportMatcher),
      },
    },
  };
}

const f = (n: number) => n.toFixed(3);

export function choiceEvalMarkdown(
  r: ChoiceEvalResult,
  meta: { date: string; reviewed: boolean },
): string {
  const row = (label: string, m: RankMetrics) =>
    `${label} | ${String(m.n)} | ${f(m.hit1)} | ${f(m.hit3)} | ${f(m.mrr)}`;
  const t = r.chosenThreshold.toFixed(2);
  const fb = (x: { fallbackRecall: number }) => x.fallbackRecall.toFixed(2);
  const lines = [
    `# Choice learning eval ${meta.date}${meta.reviewed ? "" : " (PROVISIONAL)"}`,
    "",
    meta.reviewed
      ? "Paraphrase set reviewed (`eval/choices/REVIEWED`)."
      : "**Provisional:** the paraphrase set has not been reviewed yet (`eval/choices/REVIEWED` is missing).",
    "",
    "Spec §15.4. A remembered choice is the query's `ideal` icon, else its first acceptable one, as a user who had picked an icon for each category would have.",
    "",
    "## (a) Exact repeats",
    "",
    `${String(Math.round(r.exactRepeatTop1 * r.exactRepeats))} of ${String(r.exactRepeats)} repeats return the remembered icon first (${f(r.exactRepeatTop1)}).`,
    "",
    "## Choosing `choiceSimilarity` (dev only)",
    "",
    "The memory holds the tune half's choices. Gain: the tune half's paraphrases. Harm: the report half's original dev queries, which that memory has never seen.",
    "",
    "| similarity | paraphrase n | Hit@1 | Hit@3 | MRR | unseen n | Hit@1 | Hit@3 | MRR |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| ${row("none", r.tuning.paraphrasesNone)} | ${row("", r.tuning.unseenNone).slice(3)} |`,
    ...Object.entries(r.tuning.byThreshold).map(
      ([th, m]) =>
        `| ${row(`≥ ${th}`, m.paraphrases)} | ${row("", m.unseen).slice(3)} |`,
    ),
    "",
    `Chosen: **${t}**, the best paraphrase MRR among thresholds whose unseen queries lose at most ${r.tolerance.toFixed(2)} Hit@3 and MRR.`,
    "",
    "## (b) Held-out paraphrases (every dev choice remembered)",
    "",
    "| memory | n | Hit@1 | Hit@3 | MRR |",
    "| --- | --- | --- | --- | --- |",
    `| ${row("none", r.report.paraphrases.none)} |`,
    `| ${row(`similarity ≥ ${t}`, r.report.paraphrases.withMemory)} |`,
    "",
    "## (c) Queries never remembered (v2 test split)",
    "",
    "| memory | n | Hit@1 | Hit@3 | MRR | fallback R |",
    "| --- | --- | --- | --- | --- | --- |",
    `| ${row("none", r.report.unrelated.none)} | ${fb(r.report.unrelated.none)} |`,
    `| ${row(`all dev choices, similarity ≥ ${t}`, r.report.unrelated.withMemory)} | ${fb(r.report.unrelated.withMemory)} |`,
  ];
  return lines.join("\n") + "\n";
}
