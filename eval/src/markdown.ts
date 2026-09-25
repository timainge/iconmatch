import type { ConfigResult } from "./cli.js";
import type { Metrics } from "./metrics.js";

const f = (n: number) => n.toFixed(3);
const pct = (n: number) => n.toFixed(2);

function row(label: string, m: Metrics): string {
  return `| ${label} | ${String(m.n)} | ${f(m.hit1)} | ${f(m.hit3)} | ${f(m.hit5)} | ${f(m.mrr)} | ${m.fallback.threshold.toFixed(2)} | ${pct(m.fallback.precision)} | ${pct(m.fallback.recall)} |`;
}

const HEADER = [
  "| config | n | Hit@1 | Hit@3 | Hit@5 | MRR | minConfidence | fallback P | fallback R |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
];

/** Spec §9.3 acceptance bar for v1. */
export const ACCEPTANCE = { hit3: 0.7, fallbackRecall: 0.6 } as const;

/** Each config's test numbers against the acceptance bar. */
function acceptance(test: ConfigResult[]): string[] {
  if (test.length === 0) return [];
  const mark = (ok: boolean) => (ok ? "yes" : "**no**");
  return [
    "",
    `### Acceptance bar (test): Hit@3 ≥ ${ACCEPTANCE.hit3.toFixed(2)}, fallback R ≥ ${ACCEPTANCE.fallbackRecall.toFixed(2)} at the config's threshold`,
    "",
    "| config | Hit@3 | Hit@3 met | fallback R | fallback R met | both |",
    "| --- | --- | --- | --- | --- | --- |",
    ...test.map((r) => {
      const hit = r.report.hit3 >= ACCEPTANCE.hit3;
      const rec = r.report.fallback.recall >= ACCEPTANCE.fallbackRecall;
      return `| ${r.config} | ${f(r.report.hit3)} | ${mark(hit)} | ${pct(r.report.fallback.recall)} | ${mark(rec)} | ${mark(hit && rec)} |`;
    }),
  ];
}

/** Spec §9.3 results table: configs × splits, the dev threshold sweep and per-group numbers. */
export function resultsMarkdown(options: {
  date: string;
  reviewed: boolean;
  dev: ConfigResult[];
  test: ConfigResult[];
  notes?: string[];
}): string {
  const { date, reviewed, dev, test } = options;
  const lines = [
    `# Eval results ${date}${reviewed ? "" : " (PROVISIONAL)"}`,
    "",
    reviewed
      ? "Eval set reviewed (`eval/REVIEWED`)."
      : "**Provisional:** the eval set has not been reviewed yet (`eval/REVIEWED` is missing). Don't cite these numbers or judge the acceptance bar on them.",
    "",
    "Fallback P/R use each config's default `minConfidence` (column; keyword-only configs use the keyword threshold). Hit@k and MRR are over queries with acceptable ids; fallback metrics are over all queries.",
    ...(options.notes ?? []).map((n) => `\n${n}`),
    "",
    "## Dev (tuning split)",
    "",
    ...HEADER,
    ...dev.map((r) => row(r.config, r.report)),
    "",
    "## Test (reporting split)",
    "",
    ...HEADER,
    ...test.map((r) => row(r.config, r.report)),
    ...acceptance(test),
    "",
    "## `minConfidence` sweep (dev)",
    "",
    `| threshold | ${dev.map((r) => `${r.config} P | ${r.config} R`).join(" | ")} |`,
    `| --- | ${dev.map(() => "--- | ---").join(" | ")} |`,
    ...(dev[0]?.sweep ?? []).map(
      (s, i) =>
        `| ${s.threshold.toFixed(2)} | ${dev
          .map((r) => {
            const x = r.sweep[i];
            return x ? `${pct(x.precision)} | ${pct(x.recall)}` : " | ";
          })
          .join(" | ")} |`,
    ),
  ];
  const baseline = dev.find((r) => r.config === "baseline");
  const others = dev.filter(
    (r) => r !== baseline && r.config !== "keyword" && r.config !== "vector",
  );
  if (baseline && others.length > 0) {
    const d = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(3)}`;
    lines.push(
      "",
      "## Δ vs baseline (dev)",
      "",
      "| config | ΔHit@1 | ΔHit@3 | ΔMRR | Δ fallback R |",
      "| --- | --- | --- | --- | --- |",
      ...others.map(
        (r) =>
          `| ${r.config} | ${d(r.report.hit1 - baseline.report.hit1)} | ${d(r.report.hit3 - baseline.report.hit3)} | ${d(r.report.mrr - baseline.report.mrr)} | ${d(r.report.fallback.recall - baseline.report.fallback.recall)} |`,
      ),
    );
    for (const r of others) {
      lines.push(
        "",
        `### Per group Δ Hit@3 (dev, ${r.config} − baseline)`,
        "",
        "| group | baseline | " + r.config + " | Δ |",
        "| --- | --- | --- | --- |",
        ...Object.entries(r.report.perGroup)
          .filter(([, m]) => m.n > 0)
          .map(([g, m]) => {
            const b = baseline.report.perGroup[g]?.hit3 ?? 0;
            return `| ${g} | ${b.toFixed(3)} | ${m.hit3.toFixed(3)} | ${d(m.hit3 - b)} |`;
          }),
      );
    }
  }
  // Spec §9.3: when the bar isn't met, report what's failing by group.
  for (const [split, results] of [
    ["dev", dev],
    ["test", test],
  ] as const) {
    const base = results.find((r) => r.config === "baseline") ?? results[0];
    if (!base) continue;
    lines.push(
      "",
      `## Per group (${split}, ${base.config})`,
      "",
      ...HEADER.map((h, i) => (i === 0 ? h.replace("config", "group") : h)),
      ...Object.entries(base.report.perGroup).map(([g, m]) => row(g, m)),
    );
  }
  return lines.join("\n") + "\n";
}
