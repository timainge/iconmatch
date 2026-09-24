import {
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadVectors,
} from "iconmatch";
import { describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../test-support/fake-embedder.js";
import { tabler200FullSource } from "../../test-support/full-source.js";
import { CONFIGS, runConfig, type ConfigName } from "./cli.js";
import { fallbackMetrics } from "./metrics.js";
import { readEvalSet } from "./queries.js";

// The eval infers fallback from the top search confidence instead of calling
// best(). This pins the two together so the metric can't drift from best().
describe("eval fallback inference matches best()", () => {
  it.each(Object.keys(CONFIGS) as ConfigName[])("%s", async (config) => {
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
    const queries = (await readEvalSet()).queries;
    const runs = await runConfig(config, parts, queries);
    const c = CONFIGS[config];
    for (const minConfidence of [0.3, 0.5, 0.6, 0.7]) {
      const matcher = await createIconMatcher({
        catalog: parts.catalog,
        minConfidence,
        ...(c.keyword && { keywordIndex: parts.keywordIndex }),
        ...(c.vector && { vectors: parts.vectors, embedder: parts.embedder }),
      });
      const mismatches: string[] = [];
      for (const run of runs) {
        const inferred =
          run.ranked.length === 0 || run.topConfidence < minConfidence;
        const actual =
          (await matcher.best(run.query.query)).isFallback === true;
        if (inferred !== actual)
          mismatches.push(`${run.query.query} @ ${String(minConfidence)}`);
      }
      expect(mismatches).toEqual([]);
      // And fallbackMetrics counts exactly those inferred fallbacks.
      const m = fallbackMetrics(runs, minConfidence);
      const fell = runs.filter(
        (r) => r.ranked.length === 0 || r.topConfidence < minConfidence,
      ).length;
      expect(m.truePositives + m.falsePositives).toBe(fell);
    }
  });
});
