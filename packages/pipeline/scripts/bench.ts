// `npm run bench`: warm query and embedding latency vs spec §7.5 targets.
// Needs a build dir with ingest, embed and index output (default ./build).
import { homedir } from "node:os";
import { join } from "node:path";
import { createTransformersEmbedder } from "@iconmatch/core/embedder-transformers";
import { fsSource } from "@iconmatch/core/node";
import { formatReport, runBench } from "../src/bench.js";
import { readBuildManifest } from "../src/build-manifest.js";

const buildDir = process.argv[2] ?? "build";
const manifest = await readBuildManifest(buildDir);
if (!manifest.embedding)
  throw new Error(
    `${buildDir} has no embed-meta.json; run iconmatch-build embed`,
  );
const embedder = createTransformersEmbedder({
  model: manifest.embedding.model,
  cacheDir:
    process.env.ICONMATCH_MODEL_CACHE ??
    join(homedir(), ".cache", "iconmatch", "models"),
});
const report = await runBench(fsSource(buildDir), embedder, { manifest });
console.log(formatReport(report));
if (process.argv.includes("--json")) console.log(JSON.stringify(report));
