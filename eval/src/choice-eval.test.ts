import { describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../test-support/fake-embedder.js";
import { tabler200FullSource } from "../../test-support/full-source.js";
import {
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadVectors,
} from "@iconmatch/core";
import {
  choiceEvalMarkdown,
  chosenFor,
  runChoiceEval,
  type Paraphrase,
} from "./choice-eval.js";
import type { EvalQuery } from "./queries.js";

describe("runChoiceEval (spec §15.4)", () => {
  it("measures exact repeats, tunes on dev within tolerance, and reports held-out paraphrases and unrelated queries", async () => {
    const { source } = await tabler200FullSource(
      createFakeEmbedder({ dims: 32 }),
    );
    const manifest = await loadManifest(source);
    const parts = {
      catalog: await loadCatalog(source),
      keywordIndex: await loadKeywordIndex(source),
      vectors: await loadVectors(source, manifest),
      embedder: createFakeEmbedder({ dims: 32 }),
    };
    const icons = parts.catalog.filter((e) => !e.glyph).slice(0, 8);
    const q = (i: number, split: "dev" | "test"): EvalQuery => ({
      query: `${icons[i]?.label ?? ""} things`,
      acceptable: [icons[i]?.id ?? ""],
      group: "concrete",
      split,
    });
    const remembered = [0, 1, 2, 3].map((i) => q(i, "dev"));
    const paraphrases: Paraphrase[] = remembered.map((r, i) => ({
      original: r.query,
      paraphrase: `my ${r.query}`,
      group: r.group,
      acceptable: r.acceptable,
      part: i % 2 === 0 ? "tune" : "report",
    }));
    const result = await runChoiceEval({
      parts,
      remembered,
      paraphrases,
      unrelated: [4, 5, 6].map((i) => q(i, "test")),
      thresholds: [0.5, 0.9],
    });
    expect(result.exactRepeatTop1).toBe(1);
    expect(result.exactRepeats).toBe(4);
    expect([0.5, 0.9]).toContain(result.chosenThreshold);
    expect(Object.keys(result.tuning.byThreshold)).toEqual(["0.50", "0.90"]);
    // The chosen threshold respects the no-harm tolerance on unseen dev queries.
    const chosen = result.tuning.byThreshold[result.chosenThreshold.toFixed(2)];
    expect(chosen?.unseen.mrr).toBeGreaterThanOrEqual(
      result.tuning.unseenNone.mrr - result.tolerance - 1e-9,
    );
    expect(result.report.paraphrases.withMemory.n).toBe(2);
    expect(result.report.unrelated.none.n).toBe(3);
    const md = choiceEvalMarkdown(result, {
      date: "2026-10-03",
      reviewed: false,
    });
    expect(md).toContain("# Choice learning eval 2026-10-03 (PROVISIONAL)");
    expect(md).toContain("## (c) Queries never remembered (v2 test split)");
  });

  it("remembers the ideal icon, else the first acceptable one", () => {
    expect(chosenFor({ ideal: "t:b", acceptable: ["t:a", "t:b"] })).toBe("t:b");
    expect(chosenFor({ acceptable: ["t:a", "t:b"] })).toBe("t:a");
  });
});
