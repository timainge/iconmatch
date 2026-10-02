import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

/** Paths the published `@iconmatch/core` tarball may contain (spec §11.1 M5). */
const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^dist\/(?:[\w-]+\/)*[\w.-]+\.(?:js|d\.ts)$/,
  /^data\/(?:manifest|catalog|svgs|keyword-index|vector-ids)\.json$/,
  /^data\/vectors\.bin$/,
  /^data\/licenses\/[\w-]+\.txt$/,
];

/** Paths it must contain. */
export const REQUIRED_PACK_FILES = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/node.js",
  "dist/embedders/transformers.js",
  "data/manifest.json",
  "data/catalog.json",
  "data/keyword-index.json",
  "data/svgs.json",
  "data/licenses/tabler.txt",
];

/** Problems with a tarball file list: unexpected files (sources, tests, maps…) and missing required ones. */
export function checkPackFiles(paths: string[]): string[] {
  const problems = paths
    .filter((p) => !ALLOWED.some((re) => re.test(p)) || /\.test\./.test(p))
    .map((p) => `unexpected file: ${p}`);
  for (const r of REQUIRED_PACK_FILES)
    if (!paths.includes(r)) problems.push(`missing file: ${r}`);
  return problems;
}

/** Runs `npm pack --dry-run --json` for the core package (dist and data must already exist). */
export async function packFiles(
  repoRoot: string,
): Promise<{ paths: string[]; size: number; unpackedSize: number }> {
  const { stdout } = await promisify(execFile)(
    "npm",
    [
      "pack",
      "--dry-run",
      "--json",
      "--ignore-scripts",
      "-w",
      "@iconmatch/core",
    ],
    {
      cwd: repoRoot,
    },
  );
  const [info] = JSON.parse(stdout) as {
    files: { path: string }[];
    size: number;
    unpackedSize: number;
  }[];
  if (!info) throw new Error("npm pack returned nothing");
  return {
    paths: info.files.map((f) => f.path),
    size: info.size,
    unpackedSize: info.unpackedSize,
  };
}

export interface Sizes {
  raw: number;
  gzip: number;
}

export interface CompositionSizes {
  /** Browser client: catalog + keyword index; SVGs are fetched per icon (spec §7.5). */
  browser: Sizes;
  /** Server and local-full: every data file plus the model files. */
  server: { data: Sizes; model: number; total: number };
}

async function sizeOf(files: string[]): Promise<Sizes> {
  let raw = 0;
  let gzip = 0;
  for (const f of files) {
    const buf = await readFile(f);
    raw += buf.byteLength;
    gzip += gzipSync(buf, { level: 9 }).byteLength;
  }
  return { raw, gzip };
}

/** ONNX weights file per transformers.js dtype. */
const ONNX_FILE: Record<"q8" | "fp32", string> = {
  q8: "model_quantized.onnx",
  fp32: "model.onnx",
};

/**
 * Bytes a deployment ships for the model: the config/tokenizer files plus the
 * one ONNX file its dtype uses (a cache may hold several variants).
 */
async function modelBytes(dir: string, dtype: "q8" | "fp32"): Promise<number> {
  let total = 0;
  for (const d of await readdir(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (!d.isFile()) continue;
    const isOnnx = d.name.endsWith(".onnx");
    if (isOnnx && d.name !== ONNX_FILE[dtype]) continue;
    total += (await stat(join(d.parentPath, d.name))).size;
  }
  return total;
}

/** Spec §11.1 M5: artifact sizes per composition. */
export async function compositionSizes(
  dataDir: string,
  modelDir?: string,
  dtype: "q8" | "fp32" = "q8",
): Promise<CompositionSizes> {
  const all = (await readdir(dataDir, { withFileTypes: true, recursive: true }))
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name));
  const browser = await sizeOf([
    join(dataDir, "catalog.json"),
    join(dataDir, "keyword-index.json"),
  ]);
  const data = await sizeOf(all);
  const model = modelDir ? await modelBytes(modelDir, dtype) : 0;
  return { browser, server: { data, model, total: data.raw + model } };
}

export function formatCompositionSizes(s: CompositionSizes): string {
  const mb = (n: number) => `${(n / 1_000_000).toFixed(2)} MB`;
  return [
    "| composition | downloads / ships | raw | gzip |",
    "| --- | --- | --- | --- |",
    `| browser-client | catalog + keyword index (+ per-icon SVG fetches) | ${mb(s.browser.raw)} | ${mb(s.browser.gzip)} |`,
    `| server / local-full | all data | ${mb(s.server.data.raw)} | ${mb(s.server.data.gzip)} |`,
    `| server / local-full | + embedding model (q8 ONNX + tokenizer) | ${mb(s.server.model)} | |`,
    `| server / local-full | total | ${mb(s.server.total)} | |`,
  ].join("\n");
}
