import {
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  loadVectors,
  svgsFromArtifact,
} from "@iconmatch/core";
import { createTransformersEmbedder } from "@iconmatch/core/embedder-transformers";
import { lucideSource } from "@iconmatch/lucide/node";

// Same API as the Tabler data in @iconmatch/core, with Lucide's icons.
// Passing the manifest makes the fallback use Lucide's glyphs (lucide:shapes
// when a label has no letter or digit).
const source = lucideSource();
const manifest = await loadManifest(source);
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source, { manifest }),
  keywordIndex: await loadKeywordIndex(source, { manifest }),
  vectors: await loadVectors(source, manifest),
  svgs: svgsFromArtifact(await loadSvgs(source, { manifest })),
  embedder: createTransformersEmbedder(),
  manifest,
});

const best = await matcher.best("Dog grooming"); // lucide:dog
const fallback = await matcher.best("Beekeeping"); // lucide:square-letter-b
console.log(best.id, fallback.id, await matcher.svg(best.id, { size: 24 }));
