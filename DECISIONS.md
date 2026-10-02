# Decisions

Deviations from `docs/plan.md` and choices the spec leaves open. One entry per decision, newest last.

## 2026-09-24 — npm workspaces instead of pnpm

Spec §5 says pnpm workspaces; the project owner chose npm. npm workspaces cover what we need (`packages/*`, `eval`).

## 2026-09-24 — Spec §13 answered by project owner

Brands included (flagged), outline only (no filled), no model download in the browser (composable core plus server, browser and local-full compositions), and a lettered glyph fallback. The spec was updated to match (§2, §6.1, §7.0–§7.7, §11.1, §13).

## 2026-09-24 — Autonomous-loop verification setup

Added the eval dev/test split, the two test tiers, per-milestone acceptance criteria + audits, and guard hooks (commit gate on `npm run check`, protected spec/eval files). This lets the loop run lights-out without tuning on its own report set or committing red.

## 2026-09-24 — M3 is a soft checkpoint

Owner decision. After M3 the loop writes the checkpoint report, notifies, and continues. Items that tune on or report eval numbers are tagged `WAITS: eval/REVIEWED` and skipped until the owner reviews the eval set, so unattended runs don't idle and no tuning happens on unreviewed labels.

## 2026-09-24 — Test infrastructure layout

Shared test helpers live in root `test-support/` (type-checked via the root `tsconfig.json`, not published): `tiers.ts` (`describeSlow`/`itSlow`, enabled only by `ICONMATCH_SLOW_TESTS=1`), `fake-embedder.ts` and `fixtures.ts`. Committed fixtures go under root `fixtures/` (`tabler-200/`, `ollama/`, `reference-vectors/`; see `fixtures/README.md`). The fake embedder hashes tokens (FNV-1a) into signed dims and L2-normalises, so shared words raise cosine; it records calls so later tests can prove when the model is (not) invoked. `Embedder` (spec §7.1) is defined now in `packages/core/src/types.ts` for it to implement. Slow tier raises vitest timeouts to 10 min for model downloads.

## 2026-09-24 — Shared types live in core; pipeline imports `iconmatch`

`VariantName`, `VARIANT_NAMES` and `CatalogEntry` are defined once in `packages/core/src/types.ts` (runtime needs them) and the pipeline imports them from the `iconmatch` workspace package. Core's `package.json` `exports["."]` points at `src/index.ts` for now; the subpath-exports item (§7.0) adds built `dist` conditions. `RawIcon` gains optional `brand` and `glyph` fields (not in the §6.1 sketch) so adapters can pass the §6.1 rule 3 flag and §7.4 glyph marking through to the catalog. `rawIconProblems()` checks the §6.1 invariants (kebab-case name, no suffix for a supported variant, supported variants only, lowercase deduped tags); the suffix check is limited to the adapter's declared variants so names like `text-bold` stay legal.

## 2026-09-24 — Tabler sources (verified in node_modules)

SVGs: `@iconify-json/tabler` 1.2.40 (`icons.json`, Iconify set version 3.48.0 per `info.json`, 24×24, no per-icon size overrides). Tags/category: `@tabler/icons` 3.48.0 `icons.json`, a map `name → { name, category, tags, styles }`; its `exports` map (`"./*": "./icons/*"`) hides the root file, so `readTablerSource()` finds it via `require.resolve.paths`. Versions match. Visible, non-`-filled` Iconify names equal the metadata key set exactly (5,166). Tabler tags include numbers and `null`: numbers are stringified, nulls dropped. Each icon has a single `category`, stored lowercased (brands get `brand`). "Deprecated" = Iconify `hidden: true` (14 base icons, e.g. `barell`, `pause`); `@tabler/icons` has no deprecated field. Iconify aliases (renamed old ids) are ignored.

## 2026-09-24 — Tabler counts vs §11.1 ranges

Installed counts: 5,166 concepts (in range), **376 brands** (spec sanity range 400–1,000; below it, so recorded rather than forced; the adapter test uses 350–1,000), 0 concepts with zero tags, 1,088 `-filled` dropped (34 have no outline base, e.g. `circle-0-filled`), 14 hidden skipped, 298 glyphs.

## 2026-09-24 — Glyph marking and fallback ids

`glyph` is set for single-character letter/number glyphs: `letter-<a-z>` / `number-<0-9>`, optionally `-small`, bare or framed by circle, circle-dashed, circle-dotted, hexagon, pentagon, rosette, square or square-rounded (298 icons). Multi-digit (`number-10`), `number-123`, `letter-case`, `scan-letter-*` stay rankable. Verified present in 3.48.0: `square-letter-a…z`, `square-number-0…9`, `circle-letter-a…z`, `circle-number-0…9`, and `category` (default `fallbackIcon`).

## 2026-09-24 — Variant-suffix check only for non-default variants

Tabler has real concepts `scale-outline` and `text-outline`, so `rawIconProblems()` only flags suffixes of non-default variants (e.g. `-filled`), which is how Iconify names variants.

## 2026-09-24 — Ingest output format and labels

`catalog.json` is a compact JSON array of `CatalogEntry` sorted by id; `svgs.json` is a compact object `id → variant → SvgBody` in the same order (core wire types `SvgBody`/`SvgArtifact`). Both are byte-stable for the same input (tested). Labels are sentence case of the name with hyphens as spaces; brand labels drop the `brand-` prefix ("Netflix", "Google drive") because the `brand` category and flag already carry that, and the label field gets the highest keyword boost. Any invariant violation or duplicate id fails ingest with every problem listed. Real Tabler 3.48.0 sizes: catalog 1.34 MB, svgs 1.76 MB (within §6.6 targets).

## 2026-09-24 — Keyword index: MiniSearch 7.2.0, options shared in core

MiniSearch (spec-preferred) 7.2.0 is a core dependency. `MiniSearch.loadJSON` needs the build-time tokeniser/term processing, so fields, boosts, `tokenize`, `processTerm` and search options live in `packages/core/src/keyword-index.ts` and the pipeline `index` stage imports them. Choices: tokens split on non-`[a-z0-9]`; stopwords are a 25-word English list; single letters are dropped (possessive "s", glyph names), digits kept; plural folding is rule-based (`-ies→-y`, `-(ss|sh|ch|x|z)es→`, `-s→` except `-ss/-us/-is`, words ≤3 chars and tokens with digits untouched), applied identically at build and query time. Label and name tokens are separate fields, both boost 3. Prefix search for terms ≥3 chars; fuzzy edit distance 1 for terms ≥5 chars; OR combination. No stored fields (the catalog carries display data). Real catalog: 1.09 MB index, 81 ms build; smoke queries dog/heart/money/car/calendar give plausible top 3.

## 2026-09-24 — DataSource, loaders and subpath exports

`DataSource.read(file)` takes a relative file name; `assertSafeFileName` rejects absolute paths, URLs and `..` segments so fs/fetch sources stay inside their root. Errors are `IconMatchDataError` with the file name. `fetchSource(baseUrl, { fetch })` looks up `globalThis.fetch` only when a file is read (spec §7.0 rule 2) and accepts an injected fetch for tests. `memorySource` accepts string/`Uint8Array`/`ArrayBuffer` and returns copies. `iconmatch/node` (`src/node.ts` re-exporting `data/fs.node.ts`) ships `fsSource(dir)` and `packagedSource()` (reads `packages/core/data/`, resolved from `import.meta.url`, which works from both `src/data/` and a future `dist/data/`). Loaders (`loadManifest`, `loadCatalog`, `loadKeywordIndex`, `loadSvgs`) each read one artifact, use manifest file names when given a manifest and otherwise §6.6 defaults, and `loadManifest` rejects any `schemaVersion` other than 1. `loadVectors` is deferred to the M2 `embed` item, which defines the vector format. `Manifest` type added per §6.6, with `embedding`/`enrichment` optional (keyword-only builds). Package `exports` still point at `src/*.ts`; the publish build switches them to `dist` in M5.

## 2026-09-24 — Keyword-only runtime (M1 matcher)

`createIconMatcher` currently takes `catalog`, `keywordIndex` and `includeGlyphs`; other parts arrive with their items. `search()` without a keyword index throws `IconMatchCapabilityError` (`method`, `part`); in M2 it will instead use whichever of keyword/vector/remote is present. Default `limit` is 10; keyword search always fetches the top 50 before tie-breaking. Query normalisation folds curly apostrophes, strips `'s` and trailing plural possessive `s'`, replaces other punctuation (except hyphens) with spaces. Keyword-only confidence (§7.2 step 7) = term coverage × score/top score, with exact-term matches counting 1 and prefix/fuzzy-only matches 0.5 per query term; a pre-eval tunable. Tie-break per §7.2 step 6, then id for determinism. MiniSearch prefix weight set to 0.2 (default 0.375) because "dog" ranked `currency-dogecoin` 3rd via name-prefix; with 0.2 the smoke set (dog/heart/money/car/calendar) is plausible, and the eval will re-tune on `dev`. The §11.1 smoke test currently runs against the real Tabler build in `packages/pipeline/src/smoke.test.ts`; it moves to the 200-icon fixture when that item lands.

## 2026-09-24 — SVG rendering

Every Tabler outline body carries `stroke-width="2"` inline (on a `<path>` or a wrapping `<g>`; verified across all 5,180 non-`-filled` bodies), so a root `stroke-width` alone would not change anything. `renderSvg` therefore sets root `fill="none" stroke="currentColor"` plus round caps/joins for stroked variants, and when `strokeWidth` is given it sets the root attribute and rewrites inline `stroke-width` values to it. Without `strokeWidth` the body's own width (2) applies. Filled variants get root `fill="currentColor"` and are never given a stroke width. `size` sets the height and width follows the viewBox aspect ratio (Tabler is square). Title text and attributes are XML-escaped. `svg()` on an unknown id rejects with "Unknown icon id"; without the `svgs` part it throws `IconMatchCapabilityError`. Snapshot bodies are copied from `@iconify-json/tabler` 1.2.40 into the test.

## 2026-09-24 — Lettered fallback and `best()`

`letterFallback(label, catalog, opts)` takes the first `\p{L}`/`\p{N}` character after NFKD + stripping combining marks, lowercased. Only a–z/0–9 map to glyphs (`<set>:<shape>-letter-x` / `-number-d`); the glyph set is the set prefix of `fallbackIcon` (default `tabler:category`). Literal reading of §7.4: the _first_ alphanumeric decides, so "日本 2024" gets the neutral glyph rather than skipping to "2". `fallbackLetter` is set only when the glyph actually shows that character (spec: "the character the glyph shows"); the neutral glyph has none. A `fallbackIcon` missing from the catalog throws rather than returning an id `svg()` can't render. Fallback matches have score 0, confidence 0 and `matchedOn` all false. `best()` = top search result if its confidence ≥ `minConfidence`, else the fallback; `DEFAULT_MIN_CONFIDENCE = 0.5` is provisional until the eval sweep (a `WAITS: eval/REVIEWED` item) chooses it. `resolveVariant` moved to `variant.ts` so fallback and matcher share it.

## 2026-09-24 — Browser bundle test

`test-support/bundle.ts` bundles an entry with esbuild 0.28.2 (`platform: "browser"`, ESM, in memory) and a plugin that records any import of a Node built-in (bare or `node:`) instead of failing, so the test can list offenders. `packages/core/src/browser-bundle.test.ts` asserts the default entry pulls in no Node built-ins, no `@huggingface/transformers` and no `*.node.ts` file; a control bundles `src/node.ts` and must detect `node:fs/promises`, `node:path` and `node:url`, proving the check can fail.

## 2026-09-24 — Process: record edits and commit in separate tool calls

The guard hook runs `npm run check` before the whole Bash command. When a command both appends to a file and commits, the check runs before the append. That let `2a6178d` land with a Prettier issue in `DECISIONS.md` (`*first*` vs `_first_`), fixed in the next commit. From now on, edits and `git commit` go in separate tool calls. The hook itself is unchanged; a human may want it to re-check staged content (e.g. a git pre-commit hook).

## 2026-09-24 — Build CLI runs through tsx

Workspace sources are TypeScript with `.js` import specifiers and `exports` pointing at `src/*.ts`, which Node's built-in type stripping can't resolve, so `packages/pipeline/bin/iconmatch-build.js` registers tsx 4.23.15 (`tsx/esm/api`) and imports `src/cli.ts`. That also lets the root `iconmatch.config.ts` be TypeScript. tsx is a runtime dependency of the private pipeline package. Config (`defineConfig`, `resolveConfig` in `packages/pipeline/src/config.ts`, exported as `@iconmatch/pipeline/config`) covers sets, `buildDir`, `packageDir`, enrichment (mode none by default, provider, base URL, models, concurrency, cache file) and embedding (model, quantisation). Relative paths resolve against the config file's directory; `--build-dir` overrides relative to cwd. Stages not built yet (`enrich`, `embed`, `package`) exit 1 when run directly, and `all` logs them as skipped. Their items replace that when they land. ESLint now treats `packages/*/bin/*.js` like root `*.js` (untyped); no rule weakened. The glyph count in earlier entries is corrected to 298 (the first estimate counted two `scan-letter-*` icons the adapter excludes).

## 2026-09-24 — 200-icon fixture

`fixtures/tabler-200/` (catalog, svgs, keyword index; about 196 KB, Prettier-ignored as generated) comes from `selectFixture()`: 78 pinned everyday/smoke-set/brand concepts (including `car-suv` and `car-crash`, so "car" has realistic neighbours as in the full catalog), the 36 `square-letter-*`/`square-number-*` fallback glyphs, then non-glyph icons in FNV-1a hash order up to 200. A default-tier test regenerates it in memory from the installed packages and fails on drift, so keyword-option changes and package upgrades require `npm run fixtures`. The §11.1 keyword smoke set now runs on the fixture (`packages/core/src/smoke.test.ts`); the a–z/0–9 glyph check stays on the real catalog (`packages/pipeline/src/fallback-glyphs.test.ts`). Known weakness for the eval: with prefix search, "car" also prefix-matches "card"/"carriage" (in the fixture, `credit-card-refund` ranked 3rd before pinning more `car-*` icons).

## 2026-09-24 — Embedding model facts (verified on the Hub and in node_modules)

`Xenova/bge-small-en-v1.5` (Hub API sha `ea104dacec62c0de699686887e3f920caeb4f3e3`) ships `onnx/model.onnx` plus quantised variants including `onnx/model_quantized.onnx`. Its model card uses `pipeline('feature-extraction', …)` with `{ pooling: 'mean', normalize: true }` and the query prefix `"Represent this sentence for searching relevant passages: "`, matching spec §6.4 (upstream BAAI docs use CLS pooling; the spec defers to this card, so mean). `@huggingface/transformers` 4.3.0: `pipeline(task, model, { dtype, local_files_only, cache_dir, … })`, `env.{remoteHost, localModelPath, allowLocalModels, allowRemoteModels, cacheDir}`, dtype `"q8"` selects the quantised weights. Its `exports` resolve `node` → `dist/transformers.node.mjs`, otherwise `dist/transformers.web.js`.

## 2026-09-24 — Query prefix and transformers embedder

`QUERY_PREFIX`, `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_EMBEDDING_DIMS` and `embeddingInput(text, kind)` live in `packages/core/src/embedding.ts` (default entry, browser-safe); a test scans every non-test `.ts` under `packages/`, `eval/`, `examples/` and requires the prefix literal only there. `iconmatch/embedder-transformers` (`src/embedders/transformers.ts`) is the only importer of `@huggingface/transformers` (optional peer dependency, dev dependency for tests). It does a dynamic `import()` on the first non-empty `embed()` or explicit `load()`, memoises the pipeline (one load under concurrent calls), and clears the memo on failure so a later call can retry. `modelLocation`: `http(s)://` sets `env.remoteHost` (mirror), anything else sets `env.localModelPath` + `allowLocalModels`; `localOnly` sets `allowRemoteModels = false` and `local_files_only`. These mutate transformers.js's global `env`, so two embedders with different locations in one process would interfere (acceptable for the three compositions). Default dtype `q8`. Slow-tier model cache: `ICONMATCH_MODEL_CACHE` or `~/.cache/iconmatch/models` (outside the repo, 34 MB).

## 2026-09-24 — `embed` stage and `vectors.bin` format

Format (shared in `packages/core/src/vectors.ts`): int8 = N×dims int8 values zero-padded to a 4-byte boundary, then N little-endian float32 per-vector scales (`scale = max|v|/127`, `q = round(v/scale)`); float32 = N×dims little-endian float32. Per-vector rather than global scale: it is the spec's first option and costs 4 bytes per icon; the int8-vs-float32 eval (config 7) can revisit it. Row order = `vector-ids.json` = catalog order; dims and quantisation come from the manifest, so `loadVectors(source, manifest)` requires `manifest.embedding` and validates the byte length. `documentText()` follows §6.4 exactly, omitting empty sections and adding a full stop to the label/description when missing. The stage embeds as `"document"` (no prefix) through an injected `Embedder`; the CLI uses `iconmatch/embedder-transformers` with config `embed.{model, modelLocation, localOnly, cacheDir}` (cache default `~/.cache/iconmatch/models`), batch size 32, and writes `build/embed-meta.json` (model, dims, quantisation, count) for the `package` stage's manifest. `--float32` switches quantisation. Glyph icons are embedded too so rows match the catalog; ranking excludes them at search time. Real run: 5,166 × 384 int8 in 15 s (M-series, q8 weights); `vectors.bin` 2.0 MB, `vector-ids.json` 116 KB. Data excluding SVGs is now ≈4.55 MB against the §6.6 4 MB target; the `package` item will reduce it or record the overage.

## 2026-09-24 — Hybrid ranking and confidence

`createVectorSearcher` precomputes row norms, so cosine = dot/(|row|·|query|) for both int8 and float32 (int8 scales cancel); int8 stays within 0.01 of float32 on random 384-d vectors (test). RRF uses 1-based ranks, `k = 60`, optional per-ranking weights (for §7.3 expansion); ties by id. `search()` is hybrid with a keyword index plus `vectors` + `embedder`, vector-only without an index, keyword-only otherwise; it needs a keyword index or vectors + embedder (else `IconMatchCapabilityError` naming `keywordIndex`). The raw trimmed query is embedded once as `"query"`; an empty query isn't embedded. Glyphs are excluded from both rankings. Confidence uses each result's real cosine (all rows are scored anyway), `min(1, cosine + 0.1)` if keyword-matched, clamped at 0; keyword-only matchers keep the M1 keyword confidence. Real-model check on the full build: warm `search()` 5–8 ms including embedding; top results plausible (Groceries → shopping-cart, Netflix → brand-netflix, Insurance → car-crash, shield-dollar, shield-heart). bge-small cosines sit around 0.5–0.6 even for unrelated icons, so "Misc" and "Beekeeping" don't fall back at the provisional `minConfidence` 0.5. Not tuned here (no eval yet); the M3 sweep must choose the default and may need a calibrated confidence.

## 2026-09-24 — `searchByEmbedding` and model/dims checks

`searchByEmbedding(vector, { limit, variant })` is synchronous (as in the §7.0 example), needs only `vectors` (`IconMatchCapabilityError` otherwise), excludes glyphs, never touches the embedder, and scores with single-ranking RRF plus confidence = cosine. The caller must supply a query embedding from the index model with the query prefix applied. Wrong length throws `IconMatchDimensionError` ("Query vector has N dims; the vector index has M"). `createIconMatcher` accepts an optional `manifest` part and rejects (returned promise, not a sync throw) with `IconMatchModelMismatchError` when `embedder.modelId` differs from `manifest.embedding.model`, or, without a manifest, from `vectors.model`. `loadVectors` now records `manifest.embedding.model` on the artifact so the check works whenever vectors came from a manifest. It also rejects when vector dims differ from `manifest.embedding.dims`. A test with the transformers embedder (fake module) proves `searchByEmbedding`, `get` and `svg` never load the model and the first text `search()` does.

## 2026-09-24 — `remoteSearch` semantics

`remoteSearch(query, { limit: 50, signal })` returns ranked `IconMatch[]` from a server. When present it replaces the local vector ranking (a local embedder is then never called) and is fused by RRF with local keyword results. `remoteTimeoutMs` defaults to 1,500 ms. On timeout the matcher rejects the wait with `IconMatchTimeoutError`, aborts `signal` so a `fetch` can cancel, and uses keyword-only results. Rejections do the same; both are reported through `onRemoteError`. Without a local keyword index a remote failure propagates, because there is nothing to fall back to. Remote fallbacks (`isFallback`) and glyph ids are dropped. Confidence for remote hits is the server's confidence (max with local keyword confidence), since the server has the cosine; `matchedOn.remote` is set on every result while remote succeeded. Remote-only ids missing from the local catalog are kept with the server's fields. The raw query is sent; empty queries skip the remote.

## 2026-09-24 — Parts matrix

`packages/core/src/parts-matrix.test.ts` builds matchers for all 32 subsets of `keywordIndex`, `vectors`, `embedder`, `svgs` and `remoteSearch` (fixture catalog, fake-embedder vectors) and checks every method against a rule table: `search`/`best` need a keyword index, remote search, or vectors + embedder (else the error names `keywordIndex`); `searchByEmbedding` needs `vectors`; `svg` needs `svgs`; `get` always works. Where search works it also checks `tabler:dog` is in the top 3 for "dog" (top 3, not top 1, because the hash-based fake embedder can rank `dog-bowl` first). Probe: making `svg()` return `""` without `svgs` fails the 16 combinations lacking it.

## 2026-09-24 — `examples/server` and two fixes it surfaced

`examples/server/server.ts` (103 lines) builds the matcher from a `DataSource` (default `packagedSource()`) and the transformers embedder for the manifest's model (lazy; injectable for tests), and exposes `handle(Request): Promise<Response>`. Routes: `GET /search?q=&limit=` (default 20), `GET /best?q=`, `GET /icons/:id` (SvgBody JSON; `variant` optional; id raw or URL-encoded), and `GET /icons/:id.svg?size=&strokeWidth=&variant=`. Errors: 400 missing/blank `q`, 404 unknown route or id, 405 non-GET, 500 with the message. The test runs it in-process on `tabler200FullSource()` (`test-support/full-source.ts`: the 200-icon fixture plus a manifest and fake-embedder vectors made with the pipeline's `documentText`), since packaged data comes with the M5 `package` stage. The root `tsconfig.json` now includes `examples/`.

Fixes: (1) `renderSvg`, `svgsFromArtifact` and the `SvgProvider`/`SvgOptions`/`RenderSvgOptions` types were missing from the `iconmatch` entry point, an M1 miss because tests imported source files directly. `public-api.test.ts` now imports the package entry points and checks every §7.0 primitive. (2) `search()` returns `[]` when the normalised query has no letters or digits, without calling the embedder or remote. Otherwise "!!!" embedded to an arbitrary vector and could clear `minConfidence`, so `best()` didn't fall back.

## 2026-09-24 — `examples/browser-client`

`createIconClient({ dataUrl, apiUrl, persist, fetch?, remoteTimeoutMs?, onRemoteError? })` (103 lines) loads only `catalog.json` + `keyword-index.json` via `fetchSource`, sets `remoteSearch` to `GET {apiUrl}/search` (with the abort signal) and an `SvgProvider` to `GET {apiUrl}/icons/:id?variant=`, and exposes `suggest` (best), `review` (20 candidates), `choose(query, iconId)` (validates the id, then calls `persist({ query, iconId })`) and `svg`. Tests route a fake `fetch` to fixture files and to the in-process server example: remote results appear, the SVG comes from the server, only the two data files are fetched, the client works keyword-only with the API down (fallback included), and an esbuild browser bundle of `client.ts` has no transformers.js, `embedders/` or Node built-ins. Browser download (§7.5): catalog 1.34 MB + keyword index 1.09 MB ≈ 2.4 MB uncompressed for the full Tabler set; compressed sizes go in the M5 per-composition size report.

## 2026-09-24 — `examples/local-full` and transformers env isolation

`createLocalMatcher({ dataDir, modelDir, embedder? })` (57 lines) loads manifest + every artifact via `fsSource(dataDir)` and uses the transformers embedder for the manifest's model with `modelLocation: modelDir, localOnly: true`. `modelDir` uses the `<model id>/…` layout (`config.json`, `tokenizer*.json`, `onnx/model_quantized.onnx`), which is exactly what the transformers.js file cache writes, so an app can bundle a warmed cache directory. Default-tier test: fake embedder over a temp data dir written by `test-support/data-dir.ts`. Slow tier: real-model data dir, search from the cached model offline, and a second test that an empty `modelDir` with `localOnly` rejects instead of downloading.

That second test first _passed a search it should have failed_: transformers.js's `env` is process-global, and the earlier embedder's `cacheDir` leaked into the local-only one. `configureEnv` now snapshots the library defaults (per env object) on first use and restores them before applying each embedder's settings, so embedders are independent (unit test added). Two embedders loading concurrently with different settings could still race; the compositions use one embedder per process.

## 2026-09-24 — Determinism test

`packages/pipeline/src/determinism.test.ts` runs ingest (real Tabler packages) + embed into two fresh temp dirs and compares SHA-256 of every file (`catalog.json`, `svgs.json`, `vectors.bin`, `vector-ids.json`, `embed-meta.json`). Default tier uses the fake embedder; the slow tier uses the real q8 model on the first 300 catalog entries (to keep the slow tier quick) and passes, so ONNX CPU inference is byte-stable run to run on this machine. Cross-machine or cross-backend stability isn't claimed. No build artifact carries a timestamp; `manifest.builtAt` (M5 `package`) will be the only non-deterministic field and should be excluded from any future determinism comparison.

## 2026-09-24 — Reference vectors, and the model card's example values don't reproduce

`fixtures/reference-vectors/bge-small-en-v1.5.q8.json` holds real q8 embeddings (rounded to 1e-7) of one query ("Dog grooming", with prefix) and one document text, generated by `npm run fixtures:vectors`. Slow tier: the current embedder must match each with cosine ≥ 0.999, and fp32 embeddings must agree with the q8 references at cosine ≥ 0.98 (checks the quantised weights against full precision). Probe: switching pooling to CLS drops cosine to 0.93 and fails both.

Verified fact: the Xenova model card prints `"Hello world."` → `[-0.04315, -0.02949, 0.02708, …]` (mean, normalised). With `@huggingface/transformers` 4.3.0 no published weight file reproduces it: fp32 `[-0.03912, -0.02573, 0.03456]` and fp16 agree with each other to about 1e-4; q8 `[-0.03703, -0.02112, 0.03120]`; int8, uint8, q4 and bnb4 differ further. CLS pooling is further still. The card output probably comes from an older library or tokenizer version, so it isn't used as a test anchor.

## 2026-09-24 — `npm run bench`

`packages/pipeline/src/bench.ts` (`runBench`, tested on the fixture with the fake embedder) loads a data dir, times the first embed (cold model load), times per-query `embed()` over 10 spec-style queries × 20 rounds, then times `search({ limit: 20 })` with the embedding excluded: vectors are pre-computed and served by a cached embedder, after a warm-up pass. Reports median, p95 (nearest rank) and max against the §7.5 targets; never fails on them. `packages/pipeline/scripts/bench.ts` runs it on `build/` and, until the `package` stage exists, writes a `build/manifest.json` from `embed-meta.json` first. Result (M-series, Node 24, full Tabler build, q8 model): warm query 3.2 ms median / 3.5 ms p95 (target ≤ 30), query embedding 1.7 / 2.7 ms (target ≤ 50), cold model load 276 ms.

## 2026-09-24 — Eval set draft (unreviewed)

`eval/queries.json` = `{ version: 1, status, queries: EvalQuery[] }` (spec §9.1 fields plus `split`); 125 queries in 7 groups: concrete 26, abstract (financial/admin) 20, hobbies 20, home-life 20, brands 15, vague 12, no-match 12. 14 queries have empty `acceptable` (12 no-match plus vague "Life" and "Someday"). Labels were chosen by browsing catalog names and tags (a name/tag grep over `build/catalog.json`), never by running the matcher, so the set isn't shaped by current rankings. No-match queries were confirmed to have no name or tag hit for the concept (bee, honey, pottery, vase, origami, taxidermy, falcon, turtle, reptile, snake, frog, sheep, llama). Split: within each group, queries sorted by SHA-256 of the text and the first round(30%) go to `test` (38 test / 87 dev; fallback queries in both). `eval/src/queries.ts` `evalSetProblems()` checks size, fallback count, groups, per-group 20–40% test share, duplicates, `ideal ∈ acceptable` and that every id exists; a default-tier test runs it against the installed catalog.

Least certain labels, flagged for the human review: vague acceptables (Misc → category/dots; Stuff to sort → box/archive/inbox; Admin → settings/clipboard-list/file-text/briefcase; Important; Later), Retirement (beach, rocking-chair), Subscriptions (credit-card, calendar-repeat, repeat), Budget and Utilities (no ideal), Garden and Home build (no ideal), Amazon orders and Airbnb stays including generic icons, "Honey harvest" as no-match, and Birdwatching → canary/feather.

## 2026-09-24 — `iconmatch-eval`

`eval/src/cli.ts` (bin `iconmatch-eval`, run through tsx like the build CLI; `eval/src/run.ts` from the §5 sketch is replaced by `cli.ts`). Configs so far: `keyword` (1), `vector` (2), `baseline` = hybrid, no enrichment (3); M4 adds enrichment configs. For each query it runs `search({ limit: 50 })` and records the ranked ids plus the top result's confidence; `best()` falls back when there is no result or the top confidence is below `minConfidence`, so fallback P/R and the §9.3 sweep (0.30–0.80, step 0.05) are computed from that without re-running. Metrics (`eval/src/metrics.ts`): Hit@1/3/5 and MRR over queries with acceptable ids (misses score 0 in MRR); fallback precision = right fallbacks / all fallbacks (1 when nothing fell back), recall = right fallbacks / queries that should fall back; per-group breakdown. Output: `eval/results/<date>-<config>.json` (report, sweep, per-query top 5, first-hit rank). `--split dev|test|all` (default dev). `--compare baseline` compares **dev** Hit@3 and MRR with `eval/results/baseline.json` (re-running on dev if another split was requested) and exits 1 on a drop > 0.02; `--update-baseline` writes the dev numbers. The CLI refuses to run if `evalSetProblems` reports anything, including unknown ids. Until `package` exists, it and `npm run bench` build the manifest from `build/embed-meta.json` via `readBuildManifest()`, and bench no longer writes into `build/`.

## 2026-09-24 — Provisional M3 results (not for citing)

`iconmatch-eval --table --update-baseline` wrote `eval/results/2026-09-24.md` (configs 1–3 on dev and test, dev threshold sweep, dev per-group for the baseline), per-config JSON (`<date>-<config>.json` for dev, `-test.json` for test) and `eval/results/baseline.json` (dev Hit@3/MRR per config). The report is stamped PROVISIONAL because `eval/REVIEWED` is missing. For groups with no fallback queries, per-group fallback P/R read 1.00/1.00 vacuously. Observations for the checkpoint, not acted on (no tuning before review): the dev baseline beats keyword-only and vector-only on Hit@3 (0.731 vs 0.564 and 0.667); abstract (Hit@3 0.50) and vague (0.14) groups are weakest; fallback at the provisional `minConfidence` 0.5 barely triggers for vector/hybrid (recall 0.11), while the dev sweep suggests 0.60–0.65 (hybrid P 0.88 / R 0.78 at 0.60). Choosing the default is the `WAITS: eval/REVIEWED` re-baseline item.

## 2026-09-25 — NaN confidence from a zero query vector

The fallback-equivalence test (M3 audit gap) found that a zero query vector made cosine `NaN`: `best()` treated `NaN >= min` as false and fell back, while the eval's `NaN < min` said it didn't. It came from the fake embedder, whose opposite-signed hash collisions cancel for "amazon orders" in 32 dims; the real model won't emit zero vectors, but core shouldn't produce `NaN` from any embedder. Fixes: `createVectorSearcher.similarities` returns all zeros for a zero or non-finite query norm; `hybridConfidence` returns 0 for non-finite input; the eval infers fallback as `!(confidence >= threshold)`, exactly mirroring `best()`; the fake embedder falls back to a single hashed dimension instead of a zero vector. Dev eval vs baseline: +0.000 on every config.

## 2026-09-25 — Enrichment provider interface

`packages/pipeline/src/enrich/provider.ts`: `EnrichmentProvider { kind, model, chat({ system, messages, jsonSchema, temperature }) → { content, model } }`, chosen by `createProvider(config.enrich)`. Ollama: `POST {baseUrl}/api/chat` with `stream: false`, `format: <JSON schema>`, `options.temperature` (default 0), images as base64 on the message; reply in `message.content` (verified against `docs/api.md` in the ollama/ollama repo, main branch, fetched 2026-09-25). OpenAI-compatible (LM Studio `/v1`): `POST {baseUrl}/chat/completions` with `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`, images as `image_url` data-URL parts, optional bearer key; reply in `choices[0].message.content`. `ProviderError.retryable` covers network errors, 408, 429 and 5xx, for the enrichment backoff. Tests replay fixtures through `test-support/replay.ts`, which also captures the sent request for assertions. The fixtures in `fixtures/ollama/` are marked `"source": "synthetic"` (written from the documented shapes) because no local runtime exists yet; the runtime item replaces them with real recordings.

## 2026-09-25 — Text enrichment prompts, schema and retries

zod 4.6.5 (`ModelEnrichmentSchema`) validates the model's reply: description 1–160 chars; concepts and domains trimmed, lowercased, whitespace-collapsed and deduped, then 5–15 and 1–5 items (each ≤ 40 chars). The JSON schema sent as structured output (`ENRICHMENT_JSON_SCHEMA`) is written by hand with the same limits, because the model sees the pre-normalisation shape; zod stays the source of truth. Prompts (`PROMPT_VERSION = "text-v1"`) follow §6.3 rules 1–4, with three few-shot turns: piggy-bank (literal object), anchor (abstract symbol), arrow-bar-to-down (UI glyph with only 5 concepts); a test checks the few-shots pass the schema. On invalid output, `enrichText` appends the bad reply and a user turn listing the zod problems, and retries up to 2 more times (3 calls total, temperature 0) before throwing `EnrichmentValidationError`. `inputHash` = sha256 of JSON `[svgBody, tags, promptVersion, model]`. Enrichment is per base concept (outline body); provider errors (network/5xx) are left to the runner's backoff in part (b).

## 2026-09-25 — Enrichment cache, runner and `enrich` stage

Cache: `packages/pipeline/cache/enrichment.jsonl` (gitignored; path from `enrich.cacheFile`, resolved against the config file's directory). One JSON `Enrichment` per line, appended as each result arrives, read into a map by `inputHash`; malformed lines (e.g. a torn final write) are counted and skipped. Runner: glyph icons are skipped (they never rank); icons whose current `inputHash` is cached are skipped; `--limit N` caps the _uncached_ icons processed; a worker pool of `enrich.concurrency` (default 2) pulls from a shared queue; retryable `ProviderError`s back off exponentially (base 1 s, doubling, 5 attempts); validation and non-retryable failures are collected in the stats and don't stop the run. Stage: `enrich` writes `build/enrichments.json` (id → description/concepts/domains for cache entries matching the current catalog, model and prompt version). Mode `none` writes `{}` so a stale file can't leak into later stages. `vision` exits 1 until the vision item. `index` (concepts ×1.5, description ×0.5) and `embed` (§6.4 document text) read that file. Flags: `--mode`, `--limit`, `--model`.

## 2026-09-25 — Local LLM runtime (verified)

Machine: Apple M5, 24 GB RAM, 684 GB free. Ollama 0.34.4 was already installed and serving on `127.0.0.1:11434` (`/api/version`); LM Studio is also installed (`~/.lmstudio/bin/lms`) but not used, since Ollama is the default provider. Pulled `qwen2.5:7b-instruct` (4.7 GB, id `845dbda0ea48`); `qwen2.5vl:7b` (6.0 GB) was still pulling at commit time (the vision item confirms it). `packages/pipeline/scripts/record-enrichment.ts` recorded a real exchange into `fixtures/ollama/ollama-chat-text.json` (`"source": "recorded"`) and timed text enrichment on 20 icons spread through the catalog: **median 1.86 s, max 2.38 s, 20/20 valid on the first try**, so a full run (4,868 eligible icons) takes ≈ 2.5 h at concurrency 1, less at the default 2. Usable speed, so not a blocker. Tests now read expected values from the recorded fixture instead of hard-coding them. The invalid-reply and 503 fixtures stay synthetic (a real model can't be made to produce them on demand), as does the OpenAI-compatible one (LM Studio has no model loaded).

Observation for prompt work after review (not acted on): the recorded heart description says "A red heart shape", but the icons are colourless outlines, which breaks the "only what is drawn" rule. `text-v2` could say "outline icon, no colour"; that's a prompt change and needs an eval run once `eval/REVIEWED` exists.

## 2026-09-25 — Vision enrichment (part a)

`renderPng` (@resvg/resvg-js 2.6.2, prebuilt native binary): the core `renderSvg` output with `currentColor` → black, `fitTo` width 256, white background. The stroke keeps its viewBox width (2 of 24 units), so it scales with the image ("scaled appropriately", §6.3). Deterministic byte for byte (tested). Sparse rule (`visionFor: "sparse"`): fewer than 3 tags, or a name failing a simple readability check (a token with digits, or a ≤ 2-char token that isn't an ordinary short word). Three-letter abbreviations like `que` pass; that's a known limit of a simple rule. Real catalog: **655 of 4,868** eligible icons are sparse, all because of their names (no Tabler icon has < 3 tags). Vision prompt `vision-v1` reuses the text system prompt with the description rule changed to "only what is visibly drawn in the attached image… no colours"; the few-shots stay text-only and the image goes on the final user turn. `enrichText` and `enrichVision` share `enrichWithRetries` (same validation and 2-retry loop). Vision `inputHash` uses the vision prompt version and model, so text and vision entries coexist in the cache.

## 2026-09-25 — Vision mode in the runner

`runEnrichment` takes an optional `visionProvider` and `visionFor` (default `sparse`). `planFor(entry)` picks vision (the vision model with `vision-v1`) when `visionFor` is `all` or the icon is sparse, otherwise text (the text model with `text-v1`), and returns the matching `inputHash`; the runner and `currentEnrichments` both use the plan, so each icon resolves to exactly one cache entry and text and vision entries coexist. Vision icons are rendered on demand (`renderPng`, injectable for tests) and sent as base64. A vision failure is recorded like any other; there's no automatic text fallback (the icon simply has no enrichment in that build). CLI `--mode vision` builds two providers (text and vision model) and logs how many results used vision.

## 2026-09-25 — Query expansion hook

`expandQuery?: (q) => Promise<string[]>` on `createIconMatcher` (§7.3). `search()` now ranks each query text separately (`rankQuery`: keyword top 50 plus remote or vector top 50, with per-icon confidence), fusing every ranking by RRF; with expansions the original's rankings get weight `EXPANSION_ORIGINAL_WEIGHT = 2`, each expansion 1. Expansions are trimmed; empty ones and case-insensitive duplicates of the original are dropped. A rejecting expander is reported through `onExpandError` and the search continues unexpanded. Per icon, confidence is the **max** across query texts and `matchedOn` flags are OR-ed; the max lets an expansion-found icon satisfy `best()`, which is the point of the hook, but it also means an expander can make vague labels fall back less. It's the app's opt-in, and eval config 6 (`WAITS`) measures it. No LLM ships in the library; `examples/query-expansion/ollama-expander.ts` is a type-checked, tested example calling Ollama `/api/chat` with a JSON schema for 2–3 objects. The refactor is behaviour-neutral without an expander (dev eval vs baseline: +0.000 on all configs).

## 2026-09-25 — `package` stage and the size overage

`ingest` now also writes `build/sets.json` (id, version, SPDX licence, attribution flag, count) and `build/licenses/<set>.txt` from a new optional adapter hook `licenseText()` (Tabler: `@tabler/icons/LICENSE`, "MIT License, Copyright (c) 2020-2026 Paweł Kuna"). `package` copies catalog, svgs, keyword index and (when `embed-meta.json` exists) vectors + ids into `enrich.packageDir` (default `packages/core/data/`, now gitignored as generated), copies the licences, fails if any set lacks licence text (§8 MUST), and writes the §6.6 `manifest.json`: `sets` from `sets.json`; `embedding` from `embed-meta.json` plus the shared `QUERY_PREFIX`; `enrichment` = `none` unless `build/enrichments.json` is non-empty (`text` → text model and `text-v1`; `vision` → both models and prompt versions joined with " + "). It only overwrites the files it owns and never deletes (deleting outside `build/`/`cache/` is a hard checkpoint). `builtAt` is the only non-deterministic field. Size report on the real build: total **6.31 MB** (≤ 8 MB target, ok); **excluding SVGs 4.55 MB, over the 4 MB target** (catalog 1.34, keyword index 1.09, vectors 2.00, ids 0.12). Recorded rather than forced (§11.1 M5 allows it): the only big wins would change the §6.2 catalog shape (per-entry `set`/`name`/`license` are derivable from the id) or drop int8 per-vector scales, and dropping glyph vectors saves just 0.1 MB. Revisit in the size-report item after enrichment, which will also grow the index. Browser download (catalog + index): 2.43 MB.

## 2026-09-25 — Publish-ready package: a `source` export condition

`packages/core/package.json` (`iconmatch` 0.1.0, MIT, `sideEffects: false`, Node ≥ 20) maps each export (`.`, `./node`, `./embedder-transformers`) as `{ source: ./src/*.ts, types: ./dist/*.d.ts, default: ./dist/*.js }`. Consumers don't set the custom `source` condition, so they get the compiled `dist` (`npm run build` = `tsc -p packages/core/tsconfig.build.json`; `prepack` runs it). Development opts into `source` everywhere, so it needs no build step: `customConditions: ["source"]` in `tsconfig.base.json` (the root typecheck and ESLint's per-package project service both see it), Vitest `resolve`/`ssr.resolve` conditions (`source` + Vite's defaults), esbuild `conditions` in the bundle test, `tsx --conditions=source` in npm scripts, and `#!/usr/bin/env -S node --conditions=source` shebangs for the dev-only bins. Verified: plain `node` (no conditions) resolves `iconmatch` to `packages/core/dist/index.js` and searches the packaged data. `files`: `dist`, `data`, `README.md`, `LICENSE` (the README and LICENSE come with the README item; `npm pack --dry-run` checks contents in its own item). Workspace dependents now depend on `iconmatch@^0.1.0`.

## 2026-09-25 — README

The published README is `packages/core/README.md` (in the package's `files`); the root `README.md` is a short map of the repo. README code blocks sit under `<!-- example: path -->` markers and are verbatim copies of `examples/readme/{quick-start,browser,expansion}.ts`, which the root tsconfig type-checks; `npm run readme` re-syncs them, and a default-tier test fails if they drift (§11.1 M5 "type-checked"). The README includes Tabler's MIT notice verbatim (tested against `@tabler/icons/LICENSE`, §8), the brand-trademark note (§6.1.3), a keyword-only quality note (§7.2.7), says the default `minConfidence` is provisional, and quotes no eval numbers (tested) while the eval set is unreviewed. `packages/core/LICENSE` is MIT, "Copyright (c) 2026 the iconmatch authors" (the package was already declared MIT; the holder wording avoids naming a person). Found while writing it: §8's `matcher.attributions()` MUST was never implemented. Added as its own checklist item.

## 2026-09-25 — `attributions()`

§8 requires `matcher.attributions()`. Adapters already declare `license.attributionRequired`; ingest now carries it and the licence URL into `build/sets.json`, and `package` writes them into `manifest.sets[]` as optional fields next to the §6.6 ones (`attributionRequired`, `url`). `attributions()` returns `{ set, license, url? }` for sets with `attributionRequired: true` (empty for Tabler, which is MIT) and throws `IconMatchCapabilityError("attributions", "manifest")` without the `manifest` part; the part now also accepts `sets`.

## 2026-09-25 — CI workflow (written, not pushed)

`.github/workflows/ci.yml` (ubuntu, Node 22): `npm ci`, `npm run check` (default tier: offline, no Ollama), then the §10 integration build `npx iconmatch-build all --config iconmatch.ci.config.ts --mode none` with the model cache (`~/.cache/iconmatch/models`) cached between runs, a check that `build-ci/package/manifest.json` and `vectors.bin` exist, and `npm run build && npm pack --dry-run -w iconmatch`. `iconmatch.ci.config.ts` wraps the Tabler adapter in the new `subsetAdapter(adapter, names)` (exported from `@iconmatch/pipeline/config`) using the names in `fixtures/tabler-200/catalog.json`, building into `build-ci/` (gitignored). New `--package-dir` CLI flag. Tested in-process with the fake embedder (package holds exactly the 200 fixture ids) and run for real locally: 200 icons, 0.26 MB packaged. The workflow runs `npm run check` (per §11.1 M5) plus the build; the slow tier isn't in CI because it needs the model and minutes of runtime. Not pushed: pushing is a human checkpoint.

## 2026-09-25 — Pack contents and per-composition sizes

`checkPackFiles()` holds an allowlist for the `iconmatch` tarball (`package.json`, `README.md`, `LICENSE`, `dist/**/*.{js,d.ts}` minus tests, the six `data/` artifacts, `data/licenses/*.txt`) plus required files. The default tier unit-tests it; a slow-tier test runs `npm run build` and the real `npm pack --dry-run --json --ignore-scripts -w iconmatch`. Real result: **48 files, 2.39 MB packed, 6.39 MB unpacked**, no sources or tests. `npm run sizes` (build, then `compositionSizes` + pack check) reports per composition, counting only the model files a deployment ships (config, tokenizer and the one ONNX file for its dtype; the local cache holds every variant I downloaded while checking the model card):

| composition         | ships                                            | raw      | gzip    |
| ------------------- | ------------------------------------------------ | -------- | ------- |
| browser-client      | catalog + keyword index (+ per-icon SVG fetches) | 2.43 MB  | 0.40 MB |
| server / local-full | all data                                         | 6.31 MB  | 2.36 MB |
| server / local-full | + q8 model (ONNX + tokenizer)                    | 34.73 MB |         |
| server / local-full | total                                            | 41.04 MB |         |

These are pre-enrichment sizes; enrichment will grow the keyword index.

## 2026-09-25 — Full-catalog text enrichment run

`iconmatch-build enrich --mode text` (qwen2.5:7b-instruct via Ollama, concurrency 2, prompt `text-v1`): **4,868 / 4,868 eligible icons enriched, 0 failures** (no validation give-ups, no provider errors) in 3 h 26 min wall-clock (≈ 2.5 s/icon, with test runs competing for the machine). Cache: `packages/pipeline/cache/enrichment.jsonl` (4,868 lines, gitignored); `build/enrichments.json` is 1.1 MB. Spot checks: pig-money → savings, piggy bank; tip-jar → donation, charity; receipt-tax → tax, vat, tax return; shield → security, protection, safety (no "insurance", the spec's own example); rocking-chair → relaxation, nursery (no "retirement"). 104 descriptions mention a colour despite outline icons, the `text-v1` weakness noted earlier. **`build/` was not re-embedded or re-indexed with enrichment**: the committed eval baseline (config 3, no enrichment) must stay reproducible, and measuring enrichment is eval config 4, a `WAITS: eval/REVIEWED` item, as are prompt revisions judged on eval numbers.

## 2026-09-25 — Vision enrichment run

Real vision fixture recorded (`fixtures/ollama/ollama-chat-vision.json`, `"source": "recorded"`, image omitted from the stored request) with `packages/pipeline/scripts/record-vision.ts`; timing on 10 sparse icons: **median 6.35 s, max 6.83 s, 10/10 valid**. Full `iconmatch-build enrich --mode vision` (visionFor `sparse`): **655 / 655 sparse icons enriched with qwen2.5vl:7b, 0 failures**, the other 4,213 reused from the text cache, in 1 h 32 min (≈ 8.4 s/icon; concurrency 2 gains little with one vision model loaded). `build/enrichments.json` now holds 4,868 entries (655 vision + 4,213 text). The vision prompt fixes the colour problem: 0 of 655 vision descriptions mention a colour (text-v1: 104 of 4,868). As with the text run, `build/` isn't re-embedded or re-indexed, and measuring the effect is eval config 5 (`WAITS: eval/REVIEWED`).

## 2026-09-25 — Re-baseline on the reviewed eval set; default thresholds

The owner created `eval/REVIEWED` with `eval/queries.json` unchanged (the `eval/label-issues.md` suggestions weren't applied; the `status` field inside the file still says "draft" and can't be edited now). Re-baseline (`iconmatch-eval --table --update-baseline` → `eval/results/2026-09-25.md`, `baseline.json`): Hit@k and MRR are identical to the provisional run (dev baseline Hit@3 0.731, MRR 0.639; test Hit@3 0.758, MRR 0.698).

**`DEFAULT_MIN_CONFIDENCE = 0.60`**, chosen by maximising fallback F1 on dev for the baseline (hybrid) config: 0.60 gives P 0.875 / R 0.778 / F1 0.824; the next best was 0.65 at F1 0.818. The same sweep showed keyword-only confidence is on another scale (keyword F1 0.640 at ≤ 0.50, 0.367 at 0.60 with 31 wrong fallbacks), so a single default would make the browser client's keyword-only path, used when the server is down, fall back constantly. Added **`keywordMinConfidence`** (default **0.50**): `best()` applies `minConfidence` when vectors or remote search contributed to the ranking, else `keywordMinConfidence`. The eval mirrors this per config (keyword → 0.50, vector/baseline → 0.60), and the results tables now show each config's threshold. The CLI looks for `REVIEWED` next to the scored `--queries` file.

**Test split at these defaults (reported, not tuned):** baseline fallback **P 0.50 / R 0.20**, far below dev and below the §9.3 bar (recall ≥ 0.6), while Hit@3 0.758 is above its 0.70 bar. Test has only 5 fallback queries. Misses: "Life" → lifebuoy (0.688), "Llama trekking" → trekking (0.716, the flagged label), "Turtle care" (0.636), "Pottery" (0.615); "Misc" (0.553) fell back although its label accepts `category`/`dots`. Two misses come from the +0.1 keyword bump on lexical matches, pointing at confidence calibration. The acceptance verdict is the final M5 results item's job, after enrichment (configs 4–5) is measured.

## 2026-09-25 — Configs 4–5: enrichment regresses ranking; not adopted

Enriched builds: `build-text/` (text-v1 for all 4,868) and `build-vision/` (vision-v1 for 655 sparse + text for the rest), each re-embedded (§6.4 document text with description/concepts/domains) and re-indexed (concepts ×1.5, description ×0.5). The eval gained `text`/`vision` configs with their own data dirs (`--data-text`, `--data-vision`; skipped when absent) and a "Δ vs baseline (dev)" table with per-group deltas.

| dev          | Hit@1 | Hit@3          | MRR            | fallback R @0.60 |
| ------------ | ----- | -------------- | -------------- | ---------------- |
| baseline (3) | 0.526 | 0.731          | 0.639          | 0.78             |
| text (4)     | 0.487 | 0.615 (−0.115) | 0.582 (−0.057) | 0.89             |
| vision (5)   | 0.500 | 0.615 (−0.115) | 0.589 (−0.050) | 0.89             |

Test agrees (Hit@3 0.758 → 0.667). By group on dev, abstract (the target) falls 0.50 → 0.36, home-life 0.79 → 0.50, hobbies 0.79 → 0.64; brands and vague are unchanged. Diagnosis on dev: enriched index + base vectors → hybrid Hit@3 0.692 (−0.039); base index + enriched vectors → 0.705 (−0.026); both → 0.615. The two rankings stop being independent once the same generic concepts ("finance", "design", "money"…) drive both, and RRF double-counts that. **Decision:** enrichment isn't adopted; the packaged defaults stay unenriched (config 3). Configs 4–5 are stored in `baseline.json` as their own entries so a v2 attempt can be compared; config 3's baseline is untouched. Added a discovered "Enrichment v2" item (dev-only tuning). Vision barely differs from text because it replaces only 655 icons.

## 2026-09-25 — Enrichment v2: reweighting v1 can't help; `text-v2` prompt

Dev experiments reusing the text-v1 metadata (hybrid Hit@3/MRR at 0.60; this script's no-enrichment corner reads 0.718/0.631 because it batches embeddings differently, so compare within the table): every combination of index boosts (concepts 0.25/0.5/1/1.5, description 0/0.5) and embedded fields (concepts only, description only, full) scored below no enrichment. Concepts boost 0.25 hurt as much as 0.5, because generic concept matches pull icons into the keyword top-50 and RRF credits them by rank, whatever the boost. So the metadata content is the problem, not the weighting. `text-v2` (PROMPT_VERSION; vision follows as `vision-v2`, derived from it, with a load-time guard that its replace target still exists): concepts are 5–12 specific category names a person would give a list, budget or project, with generic words (design, technology, symbol, icon, graphic, element, interface, data, information, concept, object, shape) banned, and no colours in descriptions; few-shots updated (piggy-bank → super contributions, retirement savings…). Schema limits unchanged (5–15). 12-icon sample: median 1.73 s, 0 failures, noticeably more concrete (brand-letterboxd → film reviews, watchlist, movie ratings), some generic terms remain ("finance"). Full text-v2 run goes to `build-text2/`; the v1 cache entries stay (the prompt version is part of `inputHash`).

## 2026-09-25 — Config 7: int8 vs float32

`build-float32/` = baseline data with `embed --float32` (vectors.bin 7.93 MB vs 2.00 MB int8). New eval config `float32` (`--data-float32`, default `./build-float32`). Hybrid results: **test identical** (Hit@3 0.758, MRR 0.698, fallback P/R 0.50/0.20); dev Hit@1/Hit@3 identical (0.526/0.731), Hit@5 0.756 vs 0.769 and MRR 0.637 vs 0.639 (float32 marginally lower, noise). Per-vector int8 is equivalent in accuracy, so it stays the default at a quarter of the size; the §6.4 "global scale" alternative isn't pursued, since per-vector scales cost only 4 bytes per icon.

## 2026-09-25 — Enrichment v2: text-v2 helps dev, hurts test; not adopted

The full text-v2 run (4,868 icons, 0 failures) was re-embedded and re-indexed into `build-text/`, which is config 4's default `--data-text`. The v1 build moved to `build-text-v1/`. `build/` stays unenriched, and so do the packaged defaults (`enrich.mode: "none"`).

| hybrid @0.60  | Hit@1 | Hit@3 | MRR   | fallback P/R |
| ------------- | ----- | ----- | ----- | ------------ |
| dev baseline  | 0.526 | 0.731 | 0.639 | 0.88 / 0.78  |
| dev text-v2   | 0.615 | 0.731 | 0.694 | 0.89 / 0.89  |
| test baseline | 0.636 | 0.758 | 0.698 | 0.50 / 0.20  |
| test text-v2  | 0.424 | 0.606 | 0.562 | 0.33 / 0.20  |

Over all 111 queries, text-v2 Hit@3 is 0.694 vs 0.739 and MRR 0.655 vs 0.656. The dev gains (Paperwork, Retirement, Board games, Video games, Admin) come from categories the v2 few-shots and prompt examples resemble. The test losses (Music practice, Moving house, Insurance, Woodworking, Repairs, Vet visits, Doctor appointments, Apple devices, Zoom calls, Ideas) show LLM concepts still pull plausible but wrong icons ahead of the literal match. Dev Hit@3 didn't move while held-out quality dropped by 0.15, which reads as prompt overfitting to the dev split's flavour rather than a real improvement. **Decision:** don't adopt. The `text` entry in `baseline.json` now holds text-v2's dev numbers, so any later attempt is compared with the best enriched run. Vision-v2 isn't run: vision replaces only 655 sparse icons on top of text, and text-v2 itself doesn't generalise. Further enrichment work, such as using concepts only as a keyword-side tiebreak rather than a ranked RRF input, is left for after v1.

## 2026-09-25 — `localOnly` + local `modelLocation` turns off the transformers.js caches (audit M4 G1)

Verified in `node_modules/@huggingface/transformers` 4.3.0, `src/utils/hub.js` `loadResourceFile`: the cache (`env.useFSCache` → `env.cacheDir`, default `node_modules/@huggingface/transformers/.cache/`; `env.useBrowserCache` in browsers) is checked **before** `env.localModelPath`. The pipeline's `embed` stage runs without a `cacheDir`, so it fills that default cache, and from then on `local-full` loaded the model even from an empty `modelDir`. `configureEnv` now sets `useFSCache = false` and `useBrowserCache = false` when `localOnly` is combined with a local directory, so an offline app reads only its bundled model. Both keys are restored per embedder like the others. Online use and offline-from-the-Hub-cache (`localOnly` without a location) keep the caches. Test: `transformers.test.ts` "offline from a local directory reads only that directory, never the model cache"; the slow test "refuses to download when the model is not in modelDir" passes again with the default cache present.

## 2026-09-25 — Config 6 (query expansion) and the final results vs the acceptance bar

**Config 6.** Spec §9.3 defines it as "(5) + query expansion". Config 5 isn't adopted, so the eval also runs expansion on the shipped baseline:

- `expansion` = vision build + expansion (the spec's literal config 6).
- `baseline-expansion` = config 3 + expansion.

Expansions come from the README's `examples/query-expansion` Ollama hook (`qwen2.5:7b-instruct`, temperature 0). They're recorded once for all 125 queries in **`eval/expansions.json`** (`--expander ollama` fetches missing ones, about 80 s), so config 6 reruns offline and deterministically. A query without a recorded expansion fails the run instead of silently searching unexpanded. Expansion configs are skipped when there's no file and no `--expander`.

| config (threshold 0.60) | dev Hit@3 | dev MRR | dev fallback R | test Hit@3 | test MRR | test fallback R |
| ----------------------- | --------- | ------- | -------------- | ---------- | -------- | --------------- |
| baseline (3)            | 0.731     | 0.639   | 0.78           | 0.758      | 0.698    | 0.20            |
| baseline-expansion      | 0.731     | 0.632   | 0.56           | 0.727      | 0.659    | 0.00            |
| expansion (6)           | 0.679     | 0.560   | 0.33           | 0.727      | 0.660    | 0.00            |

Expansion doesn't improve ranking, and it wrecks fallback. Per icon, confidence is the **max** over the original and expanded texts (DECISIONS "Query expansion hook"). A concrete expansion ("Pottery" → vase, wheel…) finds some icon above 0.60, so nothing falls back. Expansion stays an opt-in hook with no default, and the README example is unchanged. Scoring confidence on the original query only (expansions still add candidates to the ranking) is a follow-up item, tuned on dev.

**Acceptance bar (spec §9.3), shipped config = baseline (3), on test:**

- **Hit@3 0.758 ≥ 0.70: met.**
- **Fallback recall 0.20 < 0.60: not met.**

No config meets both; the table's "Acceptance bar (test)" section shows each one.

What fails, by group (test, baseline), per §9.3 rather than blind tuning:

- **no-match:** recall 0.25. Pottery 0.615, Turtle care 0.636 and Llama trekking 0.716 (→ trekking, keyword bump) get plausible-looking icons. Only Taxidermy (0.571) falls back.
- **vague:** Life (0.688 → lifebuoy, keyword bump) and Things (0.678) don't fall back. Misc (0.553) falls back although its label accepts `category`/`dots`.
- **abstract:** Hit@3 0.50 (Budget, Goals, Contracts miss).
- **home-life:** Hit@3 0.67 (Utilities, Chores miss).

Test has only 5 fallback queries (dev: 9, recall 0.78 at the same threshold), so a single query moves test recall by 0.20.

The cause is calibration, not threshold choice. bge-small cosines for unrelated icons sit at 0.55–0.72, overlapping true matches, and the +0.1 keyword bump lifts accidental lexical hits (trekking, lifebuoy) past any usable threshold. Raising `minConfidence` on test would be tuning on test. Next step, a discovered item tuned on dev only: a calibrated confidence, e.g. no bump for partial-word keyword matches, or a margin/percentile against the query's own score distribution.

## 2026-09-25 — Confidence calibration: no change (dev gives no evidence for one)

I dumped each query's top result from the baseline build: cosine, whether it matched on keyword, exact vs prefix/fuzzy term coverage, and the query's cosine distribution over the catalog. I compared confidence variants on **dev only**. The script lived in scratch and isn't committed.

Separation is measured threshold-free as the AUC of "top confidence of queries that should fall back" vs "top confidence of queries with an acceptable icon":

| variant                                                | dev AUC       |
| ------------------------------------------------------ | ------------- |
| current (`cos + 0.1` if keyword-matched)               | 0.989         |
| bump × query-term coverage (exact 1, prefix/fuzzy 0.5) | 0.990         |
| bump only when every term matches exactly              | 0.983         |
| no bump                                                | 0.980         |
| z-score vs the query's catalog cosines                 | 0.959         |
| margin over the 10th / 50th cosine                     | 0.907 / 0.926 |

Best-F1 thresholds differ by a single dev query (bump × coverage 0.889 at 0.59, current 0.857 at 0.637). The per-threshold curves show coverage scaling only shifts confidences down; it doesn't separate better.

On dev, the current formula already separates almost perfectly, so there's nothing principled to tune there. The test-split failure (fallback R 0.20) is a dev/test difference: test AUC is 0.885 for both current and coverage-scaled, reported once, not tuned. It rests on 5 test fallback queries, with no-match concepts closer to real icons (Pottery → plant, Llama trekking → trekking).

**Decision:** keep the §7.2 formula and `minConfidence` 0.60. The v1 acceptance bar stays **not met on fallback recall** (Hit@3 met), reported by group in `eval/results/2026-09-25.md` and the "Config 6…" entry. Real improvement needs more eval evidence, e.g. more no-match queries in a future eval revision (the human's call; `eval/queries.json` is frozen), or a stronger embedding model. Both are out of scope for this loop.

## 2026-09-25 — Expansion confidence: keep the max; expansion wants `minConfidence` ≈ 0.65

I tried scoring each icon's confidence against the **original** query only: its original candidate confidence, or its original cosine (+ keyword bump) for icons found only through an expansion. Expansions still added candidates. On dev (baseline-expansion), ranking is identical. Fallback at 0.60 moves from P 1.00 / R 0.56 to P 0.58 / R 0.78, but across the full sweep the original-only variant separates worse:

- original-only: best fallback F1 **0.667** at 0.60.
- max: best fallback F1 **0.80** at 0.65 (P 1.00 / R 0.67).

Expansion-found icons often score low against the literal text, so correct answers fall back. **Decision:** keep the max (no code change). Expansion simply shifts confidences up, so the `expandQuery` doc comment now says to pair it with a higher `minConfidence` (0.65 on dev). The default stays 0.60, since the library ships no expander. The trial code was reverted and `eval/results` left as committed.

## 2026-09-25 — README states the reviewed eval results

`packages/core/README.md` gains an "Evaluation" subsection with the test-split numbers for the packaged defaults:

- hybrid Hit@3 0.758 / MRR 0.698;
- keyword-only Hit@3 0.606;
- fallback recall 0.20 at 0.60, with what that means for users.

It states plainly that the v1 bar is met on Hit@3 and not on fallback recall. The query-expansion section notes that expansion raises confidences (pair it with `minConfidence` ≈ 0.65) and didn't improve ranking on the eval. The old test "cites no eval numbers while they're provisional" is replaced: numbers are allowed only with `eval/REVIEWED` present, and each quoted figure must equal the committed `eval/results/<date>-{baseline,keyword}-test.json` (the date is read from the README's link). Any other Hit@k/MRR figure fails the test. A changed digit was confirmed to fail it.

## 2026-10-02 — Eval v2: 30 more no-match queries (owner-directed revision)

The owner asked for more no-match queries in a new revision of the eval set, because v1's test fallback recall rests on 5 queries. **`eval/v2/queries.json`** (version 2) is v1 **unchanged** (same queries, labels and splits) plus 30 `no-match` queries. v1 stays frozen and reproducible (`eval/queries.json`, `eval/results/`); v2 has its own results (`eval/v2/results/`) and its own review marker (`eval/v2/REVIEWED`, which only the owner creates; the eval CLI already looks for `REVIEWED` next to the queries file).

How the queries were drafted (fixed before any matcher run, so the set isn't shaped by rankings):

1. **Candidates:** 83 realistic category names across crafts, sports, pets, food, home, admin, music and health, written as one ordered list (kept in session scratch).
2. **Objective filter:** drop a candidate when any non-generic word's root (suffixes -ing/-es/-s stripped), or an extra stem listed with it, prefixes a word in any icon's name, tags, categories or label. Generic words: club, care, making, lessons, projects, rescue, tank, appointments, shows, collecting, league, duty, cleaning, farming, farm, sanctuary, forms, readings, healing, consultant, tiles. The rule was tightened twice before any matcher run: first from per-query stems to all content words, after "Guinea pig"/`pig`, "Duck eggs"/`eggs` and "Goat milking"/`milk` slipped through; then from 5-letter prefixes to suffix-stripped roots.
3. **Selection:** the first 30 survivors in list order (53 survived).
4. **Splits:** v1's rule within the new batch (SHA-256 order, first 30% to test), giving 9 test and 21 dev.

No-match totals: 42, with 13 test and 29 dev; fallback queries overall: 44, with 14 test.

Provisional run (current model, `iconmatch-eval --queries eval/v2/queries.json --out eval/v2/results --table`): Hit@k unchanged (no new queries have acceptable ids). Baseline fallback at 0.60:

- dev: P 0.95 / R 0.67;
- test: P 0.67 / R **0.14**, so v1's test miss is not small-sample noise.

The v2 dev sweep peaks at 0.65 (P 0.88 / R 0.93). Most test no-match queries score 0.59–0.64, just above 0.60. Re-choosing `minConfidence` on v2 dev waits for the owner's review. Label doubts seen in that run (Embroidery/Quilting → `needle-thread`, Lacrosse → `cricket`, instruments → music, compounds such as Bookbinding) are in `eval/label-issues.md` for the review, not edited.

The guard hook now also protects `eval/v*/REVIEWED`, and `eval/v*/queries.json` once that revision is reviewed.

## 2026-10-02 — Stronger embedding model: bge-base and bge-large don't beat bge-small; not adopted

Candidates were the larger models of the same family, verified on the Hub:

- `Xenova/bge-base-en-v1.5`: 768-d, sha `4d6cd88e…`.
- `Xenova/bge-large-en-v1.5`: 1024-d, sha `dfeef607…`.

Both ship `onnx/model_quantized.onnx`, and their cards use mean pooling and the same bge query prefix, so the shared `QUERY_PREFIX` applies and no core change was needed. Each was built from the shipped config with only `embed.model` changed (`eval/models/bge-{base,large}.config.ts` → `build-bge-*/`, own package dir) and evaluated on v1 (reviewed) and v2 (provisional); results are in `eval/models/results/`.

| model (hybrid, no enrichment) | data (MB) | model (MB, q8 dir) | dev Hit@3 | dev MRR | v2 dev fallback AUC | v2 dev best F1 (threshold) | test Hit@3 | v2 test fallback R / P at that threshold |
| ----------------------------- | --------- | ------------------ | --------- | ------- | ------------------- | -------------------------- | ---------- | ---------------------------------------- |
| bge-small (shipped)           | 6.31      | ~35                | 0.731     | 0.639   | 0.971               | 0.903 (0.65)               | **0.758**  | **0.71 / 0.83**                          |
| bge-base                      | 8.30      | ~114               | 0.692     | 0.595   | 0.982               | 0.885 (0.66)               | 0.667      | 0.71 / 0.71                              |
| bge-large                     | 9.62      | ~337               | 0.744     | 0.613   | 0.968               | 0.867 (0.69)               | 0.576      | 0.79 / 0.79                              |

Embedding the catalog takes 15 s / 45 s / 2 min 11 s. On dev, neither larger model is better on ranking (MRR is lower for both; bge-large Hit@3 +0.013) or on fallback F1. The test numbers, reported once after choosing on dev, agree: both lose ranking quality. **Decision:** keep bge-small. I didn't try other families (gte, nomic, mxbai, arctic): they need a model-specific query prefix or CLS pooling, which is a core change; left as an option.

The more useful finding: with bge-small at **0.65**, the threshold the v2 dev sweep picks, v2 **test** meets both halves of the §9.3 bar: Hit@3 0.758 and fallback recall 0.71 (10/14), with 2 of 33 wrong fallbacks. That is provisional until `eval/v2/REVIEWED`; changing `DEFAULT_MIN_CONFIDENCE` is the WAITS re-baseline item.

## 2026-10-02 — Eval v2 reviewed; `minConfidence` 0.65; v1 acceptance bar met

The owner reviewed `eval/v2/queries.json` with no label changes and created `eval/v2/REVIEWED`. v2 is now the eval CLI's default set (`QUERIES_FILE`; v1 stays as `QUERIES_V1_FILE`), with results in `eval/v2/results/` by default. The 30 new queries' expansions were recorded with the same Ollama expander (`eval/expansions.json`, 155 entries).

**`DEFAULT_MIN_CONFIDENCE` 0.60 → 0.65**, by the same rule as before: the best hybrid fallback F1 on the 0.05 grid, on v2 dev (29 no-match + 1 vague fallback queries). It scores 0.903 (P 0.88 / R 0.93), against 0.784 at 0.60 and 0.800 at 0.70. `keywordMinConfidence` stays 0.50 (tied best, F1 0.794 at 0.40–0.50). Dev ranking is unchanged (thresholds don't affect it): `--compare baseline` shows +0.000 for every config.

**Final results, v2 test, shipped config (hybrid, bge-small int8, no enrichment):**

- Hit@3 **0.758**, MRR 0.698.
- Fallback recall **0.71** (10/14), precision 0.83 (2 of 33 names with an acceptable icon fall back).

**Both halves of the §9.3 bar are met.** Vector-only and float32 also meet it. Text and vision enrichment miss on Hit@3; expansion misses on fallback recall (0.21).

Still failing, by query: Llama trekking → trekking (0.716), Quilting → needle-thread (0.700), Gutter cleaning → toilet-paper (0.747), and vague "Life" → lifebuoy (0.688), all above 0.65. `eval/label-issues.md` notes that the first two may deserve an acceptable icon.

With expansion, v2 dev's best fallback F1 is only 0.60 (at 0.70), so the `expandQuery` doc and README now say 0.70 and that expansion falls back less often. The README cites `eval/v2/results/2026-10-02.md`, and its test now reads the cited revision's `REVIEWED` and result files, including the default threshold.

## 2026-10-03 — Release: owner-authorised push/publish, package metadata, clean-install check

The owner asked to push, make `timainge/iconmatch` public, and publish `iconmatch` to npm, keeping the name; the name check is summarised below.

**Guard.** It still denies pushing and publishing by default. A push or publish the owner has explicitly authorised runs as one plain command prefixed `ICONMATCH_RELEASE=1`. The guard denies force pushes (`--force`, `-f`, `+ref`) always, and denies any prefixed command that is chained or contains substitution or redirection. The autonomous loop (`/next`) never uses the prefix. Checked with sample commands: plain push/publish denied; prefixed push/publish allowed; prefixed force, chained and `$(…)` variants denied.

**Package metadata.** `packages/core/package.json` gains `repository` (with `directory: packages/core`), `homepage` and `bugs`. There's no `author` field; the LICENSE holder stays "the iconmatch authors".

**Clean-install check**, outside the repo in a scratch project:

- `npm pack -w iconmatch` gives 48 files.
- The README quick start runs unchanged against the installed tarball with `@huggingface/transformers`: "Dog grooming" → dog/paw icons, SVG rendered.
- The README browser example bundles with esbuild (`--platform=browser`) to 86 KB, with no Node built-ins and no transformers.js.
- The public types type-check under `--strict --module nodenext`.

The browser example's leftover `minConfidence: 0.5` (from before the 0.65 re-tune) is removed, so it uses the documented default.

**Name check (2026-10-02/03).** `iconmatch` is unclaimed on npm. Name collisions are only an unrelated Python screen-icon detector on GitHub and "Icon Match" puzzle games on Google Play. No trademark turned up in a web search (not a formal search). The closest product is Semantic Icons (`semantic-icons`: its own ~3,000-icon set, hosted Voyage embeddings, paid generation), a different approach from matching category names to Tabler with a local model.

## 2026-10-03 — Package renamed to `@iconmatch/core`

The npm registry refused the unscoped name `iconmatch`: "Package name too similar to existing package picomatch". Its typo-squatting check would very likely refuse `icon-match` and similar variants too. The owner chose **`@iconmatch/core`** under an `iconmatch` npm organisation, over npm's suggested `@timainge/iconmatch`. It matches the existing `@iconmatch/pipeline`/`@iconmatch/eval` workspace names and leaves room for future set packages.

Changes:

- **Import specifiers:** every `iconmatch`, `iconmatch/node` and `iconmatch/embedder-transformers` specifier is now `@iconmatch/core`, `@iconmatch/core/node` and `@iconmatch/core/embedder-transformers`, across source, tests, examples and READMEs.
- **Dependencies:** workspace dependency entries are renamed.
- **Workspace flags:** `-w` flags in CI, the root `build` script and the pack check are renamed.
- **Install docs:** the README install line and the `node_modules/@iconmatch/core/data` path are updated.
- **Unchanged:** the model cache stays at `~/.cache/iconmatch/models` (a bulk rewrite briefly changed it; caught by tests and restored), the private repo-root package keeps the name `iconmatch`, and the project and bin names (`iconmatch-build`, `iconmatch-eval`) stay.

Clean-install check repeated with `iconmatch-core-0.1.0.tgz`: README quick start runs, browser bundle 86 KB. Publishing needs the `iconmatch` org on npmjs.com (owner action) and then a scoped public publish (`--access public`).

## 2026-10-03 — P1: README

The root `README.md` is rewritten as the GitHub landing page (§15.1): a real output block from 0.1.0 (honest about the "Beekeeping"/"Misc" fallbacks), the three deployment shapes with sizes, a ranking diagram, the reviewed v2 test numbers, limitations, development and licences. The owner's in-IDE edit to the old root README ("The `iconmatch` library", plus a truncated code fence) was superseded by the rewrite; the project is called iconmatch throughout, and the npm package `@iconmatch/core`. `test-support/root-readme.test.ts` checks the root README the same way as the package README:

- examples are in sync;
- every quoted eval figure equals the committed reviewed results;
- relative links resolve.

The package README must not contain relative links, which break on npm. It gains absolute links to the repository, eval results, changelog and issues. A root `CHANGELOG.md` is started; it isn't shipped in the tarball, which keeps the pack allow-list unchanged. `npm run readme` syncs both READMEs.

## 2026-10-03 — P2: Lucide sources, adapter and fallback glyphs

**Sources, verified in the installed packages:**

- **SVG bodies:** `@iconify-json/lucide` 1.2.138, `icons.json`. It holds 1,929 icons on a 24×24 grid, every body `fill="none" stroke="currentColor"` with round caps/joins and a 2px stroke. 72 icons are `hidden` (Lucide's renamed/removed icons that Iconify keeps for compatibility). Its 219 aliases live in a separate `aliases` map and are never emitted. `info.json` has no version field, and `metadata.json` has no categories.
- **Tags:** `lucide-static` 1.50.0, `tags.json`. It covers 1,858 icons and every visible Iconify icon. The one extra entry (`layout-grid-circles`) is version skew between the two packages, and is ignored.
- **Categories:** Lucide's categories exist only in its GitHub repo (`icons/*.json`); no npm package ships them. Per spec §3 ("do not crawl websites"), Lucide entries have **no categories**. Categories are the weakest keyword field (boost 1), so this costs little.
- **Licence:** ISC (`lucide-static/LICENSE`). The manifest version is the Lucide release `1.50.0`.

**Adapter** (`packages/pipeline/src/adapters/lucide.ts`): pure `lucideIcons(source)` plus `readLucideSource()`, mirroring the Tabler adapter. It emits 1,857 visible concepts plus 72 generated glyphs.

**Fallback glyphs:** Lucide has no letter/number glyphs, so the adapter generates `square-letter-[a-z]`, `square-number-[0-9]`, `circle-letter-*` and `circle-number-*`. Each is Lucide's own `square` frame (`rect 18×18 at 3,3, rx 2`) or `circle` frame (`r 10`) around the letter strokes of the matching Tabler glyph. Tabler uses the same grid, stroke and round joins, and its square frame has the same geometry. The ids follow Tabler's naming, so core's `glyphId()`/`letterFallback()` work unchanged. Iconify sometimes merges Tabler's letter into the frame's path (`…z m7 11 …`); the extraction then makes that relative move absolute from the frame's start (3,5) (unit-tested).

The shipped licence text is Lucide's ISC licence followed by the Tabler MIT notice covering the letter strokes. A render of `square-letter-a/h/q`, `square-number-7`, `circle-letter-m`, `circle-number-0`, `heart` and `shapes` was checked by eye: same weight and style. The adapter throws if Lucide ever ships its own icon with a generated glyph's name.

**Neutral glyph per set:** `IconSetAdapter.fallbackIcon` (Tabler `category`, Lucide `shapes`). Ingest checks it exists, `sets.json` and the manifest's `sets[]` carry the full id, and the matcher's default `fallbackIcon` is the manifest's first set's, else `tabler:category` as before.
