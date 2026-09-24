import { expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { tabler200FullSource } from "../../../test-support/full-source.js";
import { formatReport, runBench, stats, TARGETS } from "./bench.js";

it("stats gives nearest-rank median, p95 and max", () => {
  const samples = Array.from({ length: 100 }, (_, i) => i + 1);
  expect(stats(samples)).toEqual({ median: 50, p95: 95, max: 100 });
  expect(stats([3])).toEqual({ median: 3, p95: 3, max: 3 });
});

it("runBench measures embedding separately from warm queries", async () => {
  const { source } = await tabler200FullSource(
    createFakeEmbedder({ dims: 32 }),
  );
  const embedder = createFakeEmbedder({ dims: 32 });
  const report = await runBench(source, embedder, {
    queries: ["dog", "Groceries"],
    rounds: 2,
  });
  expect(report.icons).toBe(200);
  expect(report.targets).toEqual(TARGETS);
  expect(TARGETS).toEqual({ warmQueryMs: 30, embeddingMs: 50 });
  // 1 cold + 2 rounds × 2 queries; warm searches never call the real embedder.
  expect(embedder.calls).toHaveLength(5);
  expect(report.warmQuery.median).toBeGreaterThanOrEqual(0);
  const text = formatReport(report);
  expect(text).toContain("| warm query (excl. embedding) |");
  expect(text).toContain("≤ 30 ms");
  expect(text).toContain("| cold model load |");
});
