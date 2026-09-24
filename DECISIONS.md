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
