import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_FILES,
  MANIFEST_FILE,
  QUERY_PREFIX,
  SCHEMA_VERSION,
  type Manifest,
} from "@iconmatch/core";
import { EMBED_META_FILE, type EmbedMeta } from "./embed.js";
import { PROMPT_VERSION, VISION_PROMPT_VERSION } from "./enrich/prompts.js";
import { readBuildEnrichments } from "./enrich/stage.js";
import { SETS_FILE, type SetInfo } from "./ingest.js";

/** Spec §6.6 size targets (uncompressed). */
export const SIZE_TARGETS = {
  totalBytes: 8_000_000,
  excludingSvgsBytes: 4_000_000,
} as const;

export interface PackageOptions {
  /** `enrich` config, recorded in the manifest when enrichments exist. */
  enrich: {
    mode: "none" | "text" | "vision";
    textModel: string;
    visionModel: string;
  };
  /** Defaults to now; injectable for tests. */
  builtAt?: string;
}

export interface SizeReport {
  files: Record<string, number>;
  total: number;
  excludingSvgs: number;
  /** Browser composition: catalog + keyword index (spec §7.5). */
  browser: number;
  withinTargets: { total: boolean; excludingSvgs: boolean };
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/**
 * `package` stage (spec §6.6, §8): copies the artifacts from `buildDir` into
 * `packageDir`, writes `manifest.json` and `licenses/<set>.txt`, and reports
 * sizes. Only overwrites files it owns; never deletes.
 */
export async function runPackage(
  buildDir: string,
  packageDir: string,
  options: PackageOptions,
): Promise<{ manifest: Manifest; sizes: SizeReport }> {
  await mkdir(join(packageDir, "licenses"), { recursive: true });
  const sets = JSON.parse(
    await readFile(join(buildDir, SETS_FILE), "utf8"),
  ) as Omit<SetInfo, "licenseText">[];

  const hasVectors = await exists(join(buildDir, EMBED_META_FILE));
  const toCopy = [
    DEFAULT_FILES.catalog,
    DEFAULT_FILES.svgs,
    DEFAULT_FILES.keywordIndex,
  ];
  if (hasVectors) toCopy.push(DEFAULT_FILES.vectors, DEFAULT_FILES.vectorIds);
  for (const f of toCopy) {
    if (!(await exists(join(buildDir, f))))
      throw new Error(
        `${join(buildDir, f)} is missing; run the earlier stages`,
      );
    await copyFile(join(buildDir, f), join(packageDir, f));
  }
  const licenseDir = join(buildDir, "licenses");
  const licenses = (await exists(licenseDir)) ? await readdir(licenseDir) : [];
  for (const f of licenses)
    await copyFile(join(licenseDir, f), join(packageDir, "licenses", f));
  for (const s of sets) {
    if (!licenses.includes(`${s.id}.txt`))
      throw new Error(`No licence text for set ${s.id} (spec §8)`);
  }

  const enrichments = await readBuildEnrichments(buildDir);
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: options.builtAt ?? new Date().toISOString(),
    sets: sets.map((s) => ({
      id: s.id,
      version: s.version,
      license: s.license,
      count: s.count,
      attributionRequired: s.attributionRequired,
      url: s.url,
      ...(s.fallbackIcon !== undefined && { fallbackIcon: s.fallbackIcon }),
    })),
    enrichment:
      enrichments.size === 0 || options.enrich.mode === "none"
        ? { mode: "none" }
        : options.enrich.mode === "vision"
          ? {
              mode: "vision",
              model: `${options.enrich.textModel} + ${options.enrich.visionModel}`,
              promptVersion: `${PROMPT_VERSION} + ${VISION_PROMPT_VERSION}`,
            }
          : {
              mode: "text",
              model: options.enrich.textModel,
              promptVersion: PROMPT_VERSION,
            },
    files: { ...DEFAULT_FILES },
  };
  if (hasVectors) {
    const meta = JSON.parse(
      await readFile(join(buildDir, EMBED_META_FILE), "utf8"),
    ) as EmbedMeta;
    manifest.embedding = {
      model: meta.model,
      dims: meta.dims,
      quantisation: meta.quantisation,
      queryPrefix: QUERY_PREFIX,
    };
  }
  await writeFile(
    join(packageDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  const files: Record<string, number> = {};
  for (const f of [...toCopy, MANIFEST_FILE])
    files[f] = (await stat(join(packageDir, f))).size;
  for (const f of licenses)
    files[`licenses/${f}`] = (await stat(join(packageDir, "licenses", f))).size;
  const total = Object.values(files).reduce((a, b) => a + b, 0);
  const excludingSvgs = total - (files[DEFAULT_FILES.svgs] ?? 0);
  const sizes: SizeReport = {
    files,
    total,
    excludingSvgs,
    browser:
      (files[DEFAULT_FILES.catalog] ?? 0) +
      (files[DEFAULT_FILES.keywordIndex] ?? 0),
    withinTargets: {
      total: total <= SIZE_TARGETS.totalBytes,
      excludingSvgs: excludingSvgs <= SIZE_TARGETS.excludingSvgsBytes,
    },
  };
  return { manifest, sizes };
}

export function formatSizes(r: SizeReport): string {
  const mb = (n: number) => `${(n / 1_000_000).toFixed(2)} MB`;
  const flag = (ok: boolean) => (ok ? "ok" : "OVER");
  return [
    ...Object.entries(r.files).map(([f, n]) => `  ${f.padEnd(24)} ${mb(n)}`),
    `  total                    ${mb(r.total)} (target ≤ 8 MB: ${flag(r.withinTargets.total)})`,
    `  excluding svgs           ${mb(r.excludingSvgs)} (target ≤ 4 MB: ${flag(r.withinTargets.excludingSvgs)})`,
    `  browser (catalog+index)  ${mb(r.browser)}`,
  ].join("\n");
}
