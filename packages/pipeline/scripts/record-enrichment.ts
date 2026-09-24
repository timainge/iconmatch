// Records real provider exchanges into fixtures/ollama/ and times text enrichment.
// Run: npx tsx packages/pipeline/scripts/record-enrichment.ts [sampleSize]
// Needs a local Ollama with the configured text model (see DECISIONS.md).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CatalogEntry, SvgArtifact } from "iconmatch";
import { resolveConfig } from "../src/config.js";
import { createOllamaProvider, type Fetch } from "../src/enrich/provider.js";
import { enrichText } from "../src/enrich/text.js";

const out = fileURLToPath(
  new URL("../../../fixtures/ollama/", import.meta.url),
);
const config = resolveConfig();
const model = config.enrich.textModel;
const catalog = JSON.parse(
  await readFile("build/catalog.json", "utf8"),
) as CatalogEntry[];
const svgs = JSON.parse(
  await readFile("build/svgs.json", "utf8"),
) as SvgArtifact;

// 1. Record one real exchange for the heart icon.
let recorded: unknown;
const recordingFetch: Fetch = async (url, init) => {
  const res = await fetch(url, init);
  const body = (await res.clone().json()) as Record<string, unknown>;
  const reqBody = JSON.parse(init.body) as Record<string, unknown>;
  recorded = {
    source: "recorded",
    note: `Recorded from Ollama with ${model} on ${new Date().toISOString().slice(0, 10)}.`,
    request: { method: init.method, url, body: { model: reqBody.model } },
    response: { status: res.status, body },
  };
  return res;
};
const heart = catalog.find((e) => e.id === "tabler:heart");
if (!heart)
  throw new Error(
    "build/catalog.json lacks tabler:heart; run iconmatch-build ingest",
  );
const e = await enrichText(
  createOllamaProvider({
    baseUrl: config.enrich.baseUrl,
    model,
    fetch: recordingFetch,
  }),
  heart,
  svgs[heart.id]?.outline?.body ?? "",
);
await writeFile(
  `${out}ollama-chat-text.json`,
  JSON.stringify(recorded, null, 2) + "\n",
);
console.log(
  "recorded heart:",
  JSON.stringify({
    description: e.description,
    concepts: e.concepts,
    domains: e.domains,
  }),
);

// 2. Time a sample of icons (evenly spaced through the catalog, glyphs skipped).
const n = Number(process.argv[2] ?? "20");
const pool = catalog.filter((x) => !x.glyph);
const sample = Array.from(
  { length: n },
  (_, i) => pool[Math.floor((i * pool.length) / n)],
).filter((x): x is CatalogEntry => x !== undefined);
const provider = createOllamaProvider({
  baseUrl: config.enrich.baseUrl,
  model,
});
const times: number[] = [];
let failed = 0;
for (const icon of sample) {
  const t = performance.now();
  try {
    const r = await enrichText(
      provider,
      icon,
      svgs[icon.id]?.outline?.body ?? "",
    );
    console.log(`${icon.name}: ${r.concepts.slice(0, 6).join(", ")}`);
  } catch (err) {
    failed++;
    console.log(`${icon.name}: FAILED ${(err as Error).message.slice(0, 120)}`);
  }
  times.push(performance.now() - t);
}
times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)] ?? 0;
console.log(
  `timing: ${String(sample.length)} icons, median ${(median / 1000).toFixed(2)} s, max ${((times.at(-1) ?? 0) / 1000).toFixed(2)} s, failed ${String(failed)}; ` +
    `est. full catalog (${String(pool.length)}) at concurrency 1: ${((median * pool.length) / 3_600_000).toFixed(1)} h`,
);
