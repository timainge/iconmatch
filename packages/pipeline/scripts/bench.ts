// `npm run bench`: warm query and embedding latency vs spec §7.5 targets.
// Needs a full build in build/ (ingest, embed, index) plus a manifest; see below.
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_FILES, QUERY_PREFIX, SCHEMA_VERSION } from "iconmatch";
import { createTransformersEmbedder } from "iconmatch/embedder-transformers";
import { fsSource } from "iconmatch/node";
import { formatReport, runBench } from "../src/bench.js";
import type { EmbedMeta } from "../src/embed.js";

const buildDir = process.argv[2] ?? "build";
const meta = JSON.parse(
  await readFile(join(buildDir, "embed-meta.json"), "utf8"),
) as EmbedMeta;
// Until the `package` stage writes one, derive a manifest from embed-meta.json.
await writeFile(
  join(buildDir, "manifest.json"),
  JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    builtAt: new Date().toISOString(),
    sets: [],
    embedding: {
      model: meta.model,
      dims: meta.dims,
      quantisation: meta.quantisation,
      queryPrefix: QUERY_PREFIX,
    },
    files: DEFAULT_FILES,
  }),
);
const embedder = createTransformersEmbedder({
  model: meta.model,
  cacheDir:
    process.env.ICONMATCH_MODEL_CACHE ??
    join(homedir(), ".cache", "iconmatch", "models"),
});
const report = await runBench(fsSource(buildDir), embedder);
console.log(formatReport(report));
if (process.argv.includes("--json")) console.log(JSON.stringify(report));
