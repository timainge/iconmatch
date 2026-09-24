# iconmatch

Pick a sensible icon for a user-defined category ("Dog grooming", "Super contributions", "Kids' ski gear") from the [Tabler Icons](https://tabler.io/icons) outline set. It returns ranked matches with a confidence score, and a lettered fallback glyph when nothing fits, so it is never confidently wrong.

- **Hybrid search:** a keyword index (MiniSearch) plus semantic vectors (`bge-small-en-v1.5`), fused with Reciprocal Rank Fusion.
- **Composable:** small primitives (data sources, loaders, keyword and vector searchers, fusion, SVG rendering, fallback) and a `createIconMatcher` convenience over whichever parts you give it.
- **Runs anywhere:** Node 20+ and modern browsers. The default entry has no Node built-ins and never downloads a model.
- **Data included:** about 5,100 Tabler outline icons (brands included), their keyword index, vectors and SVGs, under `data/`.

## Install

```sh
npm install iconmatch
# Only for local semantic search (Node or desktop), not needed in the browser:
npm install @huggingface/transformers
```

## Quick start (Node)

<!-- example: examples/readme/quick-start.ts -->

```ts
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
```

## Browser (no model download)

Serve `node_modules/iconmatch/data/catalog.json` and `keyword-index.json` as static files, and run a small server for semantic search and SVGs (a framework-agnostic reference is in `examples/server` in the repository).

<!-- example: examples/readme/browser.ts -->

```ts
import {
  createIconMatcher,
  fetchSource,
  loadCatalog,
  loadKeywordIndex,
  type IconMatch,
  type SvgBody,
} from "iconmatch";

// Browser: keyword index locally (~2.4 MB), semantic search and SVGs from your
// server (see examples/server). No model download; works keyword-only if the
// server is down.
const source = fetchSource("/iconmatch-data/");
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source),
  keywordIndex: await loadKeywordIndex(source),
  remoteSearch: (q, { limit, signal }) =>
    fetch(
      `/api/icons/search?q=${encodeURIComponent(q)}&limit=${String(limit)}`,
      { signal },
    ).then((r) => r.json() as Promise<IconMatch[]>),
  svgs: {
    get: (id, variant) =>
      fetch(
        `/api/icons/icons/${encodeURIComponent(id)}?variant=${variant}`,
      ).then((r) => r.json() as Promise<SvgBody>),
  },
  minConfidence: 0.5,
});

const suggestion = await matcher.best("Kids' ski gear");
const alternatives = await matcher.search("Kids' ski gear", { limit: 20 }); // for a picker
console.log(suggestion.id, alternatives.length);
```

## Offline desktop apps

Bundle `data/` and the model directory (`Xenova/bge-small-en-v1.5/…`), then use `fsSource(dataDir)` from `iconmatch/node` and `createTransformersEmbedder({ modelLocation: modelDir, localOnly: true })`. The model loads on the first text search only; `searchByEmbedding`, `get` and `svg` never load it.

## Query expansion (optional)

Short abstract labels ("Admin", "Misc", "Life") embed poorly. `expandQuery` lets you add an LLM step. The original query is weighted ×2 when the rankings are fused.

<!-- example: examples/readme/expansion.ts -->

```ts
import { createIconMatcher, loadCatalog, loadKeywordIndex } from "iconmatch";
import { packagedSource } from "iconmatch/node";
import { ollamaExpander } from "../query-expansion/ollama-expander.js";

// Optional query expansion: ask any chat model for 2–3 concrete objects that
// could represent an abstract label. The library ships no LLM.
const source = packagedSource();
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source),
  keywordIndex: await loadKeywordIndex(source),
  expandQuery: ollamaExpander({ model: "qwen2.5:7b-instruct" }), // e.g. "Admin" -> clipboard, folder, stamp
});

console.log(await matcher.search("Admin", { limit: 5 }));
```

The expander used above (`examples/query-expansion/ollama-expander.ts` in the repository) calls a local Ollama model; any chat API works.

## API

| Primitive                                                                                            | Purpose                                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `fetchSource(url)`, `memorySource(files)`; `fsSource(dir)`, `packagedSource()` from `iconmatch/node` | Where artifacts come from                                                   |
| `loadManifest`, `loadCatalog`, `loadKeywordIndex`, `loadVectors`, `loadSvgs`                         | Load one artifact each                                                      |
| `createIconMatcher(parts)`                                                                           | `search`, `best`, `searchByEmbedding`, `get`, `svg` over the parts you pass |
| `createKeywordSearcher`, `createVectorSearcher`, `fuse`, `hybridConfidence`                          | Lower-level ranking pieces                                                  |
| `renderSvg(body, opts)`, `svgsFromArtifact(svgs)`                                                    | SVG strings from JSON-safe bodies                                           |
| `letterFallback(label, catalog)`                                                                     | The lettered glyph on its own                                               |
| `createTransformersEmbedder` from `iconmatch/embedder-transformers`                                  | Local embedder (optional peer dependency)                                   |

`matcher.attributions()` lists the icon sets whose licence requires visible credit (none for Tabler, which is MIT); it needs the `manifest` part.

Only `catalog` is required. A method whose part is missing throws `IconMatchCapabilityError` naming it; an embedder for a different model than the data throws `IconMatchModelMismatchError`; a wrong-length vector throws `IconMatchDimensionError`.

### Confidence and fallback

`confidence` (0–1) is the icon's cosine similarity to the query, plus 0.1 when it also matched on keywords. `best()` returns the lettered glyph (`square-letter-*`/`square-number-*`, or `category` when the label has no usable letter or digit) when the top confidence is below `minConfidence`. The default `minConfidence` is provisional until it's chosen from the evaluation; set your own if you rely on fallbacks.

**Keyword-only use** (no vectors or embedder, e.g. a browser with the server down) ranks by keyword match alone and derives confidence from term coverage. Its quality is noticeably lower than hybrid search, especially for abstract labels.

## Brand icons

The data includes Tabler's brand icons (`brand-*`, flagged `brand: true`). They depict third-party trademarks; you're responsible for using them in line with each owner's trademark guidelines.

## Licences

The icons are from [Tabler Icons](https://github.com/tabler/tabler-icons), used under the MIT licence; the full text ships in `data/licenses/tabler.txt`:

```text
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The embedding model [`Xenova/bge-small-en-v1.5`](https://huggingface.co/Xenova/bge-small-en-v1.5) (from BAAI's bge-small-en-v1.5) is downloaded separately under its own licence. iconmatch's own code is MIT (see `LICENSE`).
