# @iconmatch/lucide

[Lucide](https://lucide.dev) icon data for [`@iconmatch/core`](https://www.npmjs.com/package/@iconmatch/core): pick a sensible Lucide icon for a category your users named themselves, with a lettered fallback when nothing fits.

This package holds data only (catalog, keyword index, `bge-small-en-v1.5` vectors and SVGs for about 1,900 Lucide icons) plus a Node helper. The matching API is `@iconmatch/core`'s; everything in its README applies, just with this data source.

[Repository](https://github.com/timainge/iconmatch) · [Changelog](https://github.com/timainge/iconmatch/blob/main/CHANGELOG.md) · [Issues](https://github.com/timainge/iconmatch/issues)

## Install

```sh
npm install @iconmatch/core @iconmatch/lucide
# Only for local semantic search (Node or desktop), not in the browser:
npm install @huggingface/transformers
```

## Use (Node)

<!-- example: examples/readme/lucide.ts -->

```ts
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
```

## Browser

Serve the files in `node_modules/@iconmatch/lucide/data/` (at least `manifest.json`, `catalog.json` and `keyword-index.json`) and load them with `fetchSource` from `@iconmatch/core`, exactly as in the core README's browser example.

## Notes

- **One set per app.** Lucide and Tabler share a 24px grid and 2px round stroke, but they aren't mixed in one result list: choose the data source that matches your app's icons.
- **No brand icons.** Lucide doesn't include brand logos, so a name like "Netflix" gets the lettered fallback.
- **Fallback glyphs.** Lucide has no letter or number icons. This package adds `square-letter-*`, `square-number-*`, `circle-letter-*` and `circle-number-*` glyphs drawn from Lucide's own square and circle frames with letter strokes from Tabler Icons (MIT), in the same style. `lucide:shapes` is the neutral glyph.
- **Evaluation.** Measured on a reviewed, Lucide-labelled copy of the project's eval set ([results](https://github.com/timainge/iconmatch/blob/main/eval/lucide/results/2026-10-03.md)): with the default threshold (0.65, also best for Lucide on the tuning split), hybrid search meets the project's v1 bar on the held-out split (Hit@3 ≥ 0.70, fallback recall ≥ 0.60).

## Licences

The icons are from [Lucide](https://github.com/lucide-icons/lucide), used under the ISC licence; the fallback letter strokes are from [Tabler Icons](https://github.com/tabler/tabler-icons) (MIT). Both notices ship in `data/licenses/lucide.txt`. The packaging code is MIT (see `LICENSE`).
