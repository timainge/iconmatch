import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogEntry, SvgArtifact } from "@iconmatch/core";
import type { EnrichmentProvider } from "../enrich/provider.js";
import { runJudgements } from "../judge/judge.js";
import {
  galleryHtml,
  generateCandidates,
  type Candidate,
  type CandidateVerdict,
  type StyleExample,
} from "./generate.js";

/** Everyday icons used as style examples, first four present in the set. */
const EXAMPLE_NAMES = [
  "dog",
  "home",
  "house",
  "camera",
  "coffee",
  "bike",
  "tent",
  "book",
  "heart",
];

export function pickExamples(
  catalog: readonly CatalogEntry[],
  svgs: SvgArtifact,
  count = 4,
): StyleExample[] {
  const out: StyleExample[] = [];
  for (const name of EXAMPLE_NAMES) {
    const entry = catalog.find((e) => e.name === name && !e.glyph);
    const svg = entry ? svgs[entry.id]?.outline : undefined;
    if (entry && svg) out.push({ concept: entry.label.toLowerCase(), svg });
    if (out.length >= count) break;
  }
  return out;
}

export const slug = (concept: string) =>
  concept
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export type StoredCandidate = Candidate & { verdict?: CandidateVerdict };

/**
 * `iconmatch-build generate` (spec §15.7): drafts candidates for each concept
 * with the text model, optionally scores valid ones with the vision judge, and
 * writes `generated/<concept>/candidate-<n>.svg`, `candidates.json` (merged
 * across runs, by concept) and an `index.html` review gallery under the build dir.
 */
export async function runGenerate(options: {
  buildDir: string;
  concepts: string[];
  n: number;
  provider: EnrichmentProvider;
  /** When given, valid candidates are judged ("depicts the concept"). */
  judge?: { provider: EnrichmentProvider; cacheFile: string };
  log?: (message: string) => void;
}): Promise<{ candidates: StoredCandidate[]; outDir: string }> {
  const catalog = JSON.parse(
    await readFile(join(options.buildDir, "catalog.json"), "utf8"),
  ) as CatalogEntry[];
  const svgs = JSON.parse(
    await readFile(join(options.buildDir, "svgs.json"), "utf8"),
  ) as SvgArtifact;
  const examples = pickExamples(catalog, svgs);
  if (examples.length === 0)
    throw new Error("generate: no style examples found in the catalog");
  const outDir = join(options.buildDir, "generated");
  await mkdir(outDir, { recursive: true });

  const fresh: StoredCandidate[] = [];
  for (const concept of options.concepts) {
    const drafts = await generateCandidates(options.provider, {
      concept,
      examples,
      n: options.n,
    });
    options.log?.(
      `generate: ${concept}: ${String(drafts.filter((d) => d.body).length)}/${String(drafts.length)} valid`,
    );
    fresh.push(...drafts);
  }

  if (options.judge) {
    const valid = fresh.filter((c) => c.body !== undefined);
    const { judgements } = await runJudgements({
      provider: options.judge.provider,
      items: valid.map((c) => ({
        query: c.concept,
        iconId: `generated:${slug(c.concept)}#${String(c.index)}`,
        svg: { body: c.body ?? "", width: 24, height: 24 },
      })),
      cacheFile: options.judge.cacheFile,
      concurrency: 1,
    });
    const byId = new Map(judgements.map((j) => [j.iconId, j]));
    for (const c of valid) {
      const j = byId.get(`generated:${slug(c.concept)}#${String(c.index)}`);
      if (j)
        c.verdict = {
          fits: j.fits,
          confidence: j.confidence,
          reason: j.reason,
        };
    }
  }

  for (const c of fresh) {
    if (!c.body) continue;
    const dir = join(outDir, slug(c.concept));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `candidate-${String(c.index)}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${c.body}</svg>\n`,
    );
  }

  // Merge with earlier runs: this run replaces a concept's previous candidates.
  const file = join(outDir, "candidates.json");
  const previous = await readFile(file, "utf8")
    .then((t) => JSON.parse(t) as StoredCandidate[])
    .catch(() => [] as StoredCandidate[]);
  const concepts = new Set(fresh.map((c) => c.concept));
  const all = [...previous.filter((c) => !concepts.has(c.concept)), ...fresh];
  await writeFile(file, JSON.stringify(all, null, 2) + "\n");
  const rows = [...new Set(all.map((c) => c.concept))].map((concept) => ({
    concept,
    candidates: all.filter((c) => c.concept === concept),
  }));
  await writeFile(join(outDir, "index.html"), galleryHtml(rows, examples));
  return { candidates: fresh, outDir };
}
