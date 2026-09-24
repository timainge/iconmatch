// Records a real vision exchange into fixtures/ollama/ and times vision enrichment.
// Run: npx tsx --conditions=source packages/pipeline/scripts/record-vision.ts [sampleSize]
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CatalogEntry, SvgArtifact } from "iconmatch";
import { resolveConfig } from "../src/config.js";
import { createOllamaProvider, type Fetch } from "../src/enrich/provider.js";
import { enrichVision, needsVision } from "../src/enrich/vision.js";
import { renderPng } from "../src/render.js";

const out = fileURLToPath(
  new URL("../../../fixtures/ollama/", import.meta.url),
);
const config = resolveConfig();
const model = config.enrich.visionModel;
const catalog = JSON.parse(
  await readFile("build/catalog.json", "utf8"),
) as CatalogEntry[];
const svgs = JSON.parse(
  await readFile("build/svgs.json", "utf8"),
) as SvgArtifact;
const sparse = catalog.filter((e) => !e.glyph && needsVision(e));

let recorded: unknown;
const recordingFetch: Fetch = async (url, init) => {
  const res = await fetch(url, init);
  const body = (await res.clone().json()) as Record<string, unknown>;
  recorded = {
    source: "recorded",
    note: `Recorded from Ollama with ${model} on ${new Date().toISOString().slice(0, 10)} (image omitted from the request).`,
    request: { method: init.method, url, body: { model } },
    response: { status: res.status, body },
  };
  return res;
};

const first = sparse.find((e) => e.name === "a-b-2") ?? sparse[0];
if (!first) throw new Error("no sparse icons");
const svg = svgs[first.id]?.outline;
if (!svg) throw new Error(`no svg for ${first.id}`);
const e = await enrichVision(
  createOllamaProvider({
    baseUrl: config.enrich.baseUrl,
    model,
    fetch: recordingFetch,
  }),
  first,
  svg.body,
  renderPng(svg),
);
await writeFile(
  `${out}ollama-chat-vision.json`,
  JSON.stringify(recorded, null, 2) + "\n",
);
console.log(
  `recorded ${first.name}:`,
  JSON.stringify({ description: e.description, concepts: e.concepts }),
);

const n = Number(process.argv[2] ?? "10");
const sample = Array.from(
  { length: n },
  (_, i) => sparse[Math.floor((i * sparse.length) / n)],
).filter((x): x is CatalogEntry => x !== undefined);
const provider = createOllamaProvider({
  baseUrl: config.enrich.baseUrl,
  model,
});
const times: number[] = [];
let failed = 0;
for (const icon of sample) {
  const s = svgs[icon.id]?.outline;
  if (!s) continue;
  const t = performance.now();
  try {
    const r = await enrichVision(provider, icon, s.body, renderPng(s));
    console.log(
      `${icon.name}: ${r.description} | ${r.concepts.slice(0, 5).join(", ")}`,
    );
  } catch (err) {
    failed++;
    console.log(`${icon.name}: FAILED ${(err as Error).message.slice(0, 120)}`);
  }
  times.push(performance.now() - t);
}
times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)] ?? 0;
console.log(
  `timing: ${String(times.length)} sparse icons, median ${(median / 1000).toFixed(2)} s, max ${((times.at(-1) ?? 0) / 1000).toFixed(2)} s, failed ${String(failed)}; est. ${String(sparse.length)} sparse at concurrency 1: ${((median * sparse.length) / 60000).toFixed(0)} min`,
);
