// Records real judge exchanges into fixtures/ollama/ (spec §15.6) and times
// the judge. Run: npx tsx --conditions=source packages/pipeline/scripts/record-judge.ts
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { SvgArtifact } from "@iconmatch/core";
import { resolveConfig } from "../src/config.js";
import { createOllamaProvider, type Fetch } from "../src/enrich/provider.js";
import { judgeIcon } from "../src/judge/judge.js";

const out = fileURLToPath(
  new URL("../../../fixtures/ollama/", import.meta.url),
);
const config = resolveConfig();
const model = config.enrich.visionModel;
const svgs = JSON.parse(
  await readFile("build/svgs.json", "utf8"),
) as SvgArtifact;

for (const [query, iconId, file] of [
  ["Dog grooming", "tabler:dog", "ollama-judge-fits.json"],
  ["Dog grooming", "tabler:calendar", "ollama-judge-not.json"],
] as const) {
  let recorded: unknown;
  const recordingFetch: Fetch = async (url, init) => {
    const res = await fetch(url, init);
    const body = (await res.clone().json()) as Record<string, unknown>;
    recorded = {
      source: "recorded",
      note: `Recorded from Ollama with ${model} on ${new Date().toISOString().slice(0, 10)}: judge "${query}" vs ${iconId} (image omitted from the request).`,
      request: { method: init.method, url, body: { model } },
      response: { status: res.status, body },
    };
    return res;
  };
  const svg = svgs[iconId]?.outline;
  if (!svg) throw new Error(`no svg for ${iconId}`);
  const t = performance.now();
  const j = await judgeIcon(
    createOllamaProvider({
      baseUrl: config.enrich.baseUrl,
      model,
      fetch: recordingFetch,
    }),
    { query, iconId, svg },
  );
  console.log(
    `${query} / ${iconId}: fits=${String(j.fits)} conf=${String(j.confidence)} "${j.reason}" (${((performance.now() - t) / 1000).toFixed(1)} s)`,
  );
  await writeFile(`${out}${file}`, JSON.stringify(recorded, null, 2) + "\n");
}
