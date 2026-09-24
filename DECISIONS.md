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

Installed counts: 5,166 concepts (in range), **376 brands** (spec sanity range 400–1,000; below it, so recorded rather than forced; the adapter test uses 350–1,000), 0 concepts with zero tags, 1,088 `-filled` dropped (34 have no outline base, e.g. `circle-0-filled`), 14 hidden skipped, 300 glyphs.

## 2026-09-24 — Glyph marking and fallback ids

`glyph` is set for single-character letter/number glyphs: `letter-<a-z>` / `number-<0-9>`, optionally `-small`, bare or framed by circle, circle-dashed, circle-dotted, hexagon, pentagon, rosette, square or square-rounded (300 icons). Multi-digit (`number-10`), `number-123`, `letter-case`, `scan-letter-*` stay rankable. Verified present in 3.48.0: `square-letter-a…z`, `square-number-0…9`, `circle-letter-a…z`, `circle-number-0…9`, and `category` (default `fallbackIcon`).

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
