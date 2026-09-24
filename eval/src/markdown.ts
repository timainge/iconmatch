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
  const base = dev.find((r) => r.config === "baseline") ?? dev[0];
  if (base) {
    lines.push(
      "",
      `## Per group (dev, ${base.config})`,
      "",
      ...HEADER.map((h, i) => (i === 0 ? h.replace("config", "group") : h)),
      ...Object.entries(base.report.perGroup).map(([g, m]) => row(g, m)),
    );
  }
  return lines.join("\n") + "\n";
}
