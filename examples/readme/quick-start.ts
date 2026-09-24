import {
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  loadVectors,
  svgsFromArtifact,
} from "iconmatch";
import { createTransformersEmbedder } from "iconmatch/embedder-transformers";
import { packagedSource } from "iconmatch/node";

// Node: everything from the data shipped in the package, plus the local model
// (downloaded on the first text search, then cached).
const source = packagedSource();
const manifest = await loadManifest(source);
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source, { manifest }),
  keywordIndex: await loadKeywordIndex(source, { manifest }),
  vectors: await loadVectors(source, manifest),
  svgs: svgsFromArtifact(await loadSvgs(source, { manifest })),
  embedder: createTransformersEmbedder(),
  manifest,
});

const results = await matcher.search("Dog grooming", { limit: 5 });
const best = await matcher.best("Super contributions"); // may be a lettered fallback
const svg = await matcher.svg(best.id, { size: 24, title: best.label });

console.log(
  results.map((r) => `${r.id} (${r.confidence.toFixed(2)})`),
  best.isFallback,
  svg.length,
);
