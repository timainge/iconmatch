// Regenerates fixtures/reference-vectors/*.json with the real embedding model.
// Run: npm run fixtures:vectors (downloads the model into the cache if needed).
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EMBEDDING_MODEL } from "@iconmatch/core";
import { createTransformersEmbedder } from "@iconmatch/core/embedder-transformers";

const cacheDir =
  process.env.ICONMATCH_MODEL_CACHE ??
  join(homedir(), ".cache", "iconmatch", "models");
const out = fileURLToPath(
  new URL("../../../fixtures/reference-vectors/", import.meta.url),
);
const cases = [
  { kind: "query", text: "Dog grooming" },
  {
    kind: "document",
    text: "Shield. Tags: security, protection, guard. Category: system.",
  },
] as const;

const embedder = createTransformersEmbedder({ cacheDir, dtype: "q8" });
const vectors = [];
for (const c of cases) {
  const [v] = await embedder.embed([c.text], c.kind);
  if (!v) throw new Error("no vector");
  vectors.push({
    ...c,
    vector: Array.from(v, (x) => Math.round(x * 1e7) / 1e7),
  });
}
const file = join(out, "bge-small-en-v1.5.q8.json");
await writeFile(
  file,
  JSON.stringify({ model: DEFAULT_EMBEDDING_MODEL, dtype: "q8", vectors }) +
    "\n",
);
console.log(`wrote ${file}`);
