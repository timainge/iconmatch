import type MiniSearch from "minisearch";
import { parseKeywordIndex, type KeywordDocument } from "../keyword-index.js";
import type {
  CatalogEntry,
  Manifest,
  ManifestFiles,
  SvgArtifact,
} from "../types.js";
import { IconMatchDataError, type DataSource } from "./source.js";

export const SCHEMA_VERSION = 1;

/** File names used when no manifest is given (spec §6.6). */
export const DEFAULT_FILES: Readonly<ManifestFiles> = {
  catalog: "catalog.json",
  svgs: "svgs.json",
  vectors: "vectors.bin",
  vectorIds: "vector-ids.json",
  keywordIndex: "keyword-index.json",
};

export const MANIFEST_FILE = "manifest.json";

/** Pass a loaded manifest to use its file names instead of the defaults. */
export interface LoadOptions {
  manifest?: Pick<Manifest, "files">;
}

function fileFor(key: keyof ManifestFiles, options: LoadOptions): string {
  return options.manifest?.files[key] ?? DEFAULT_FILES[key];
}

async function readText(source: DataSource, file: string): Promise<string> {
  return new TextDecoder().decode(await source.read(file));
}

async function readJson(source: DataSource, file: string): Promise<unknown> {
  const text = await readText(source, file);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new IconMatchDataError(file, "is not valid JSON", { cause });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadManifest(source: DataSource): Promise<Manifest> {
  const m = await readJson(source, MANIFEST_FILE);
  if (!isRecord(m) || !isRecord(m.files)) {
    throw new IconMatchDataError(MANIFEST_FILE, "is not a manifest object");
  }
  if (m.schemaVersion !== SCHEMA_VERSION) {
    throw new IconMatchDataError(
      MANIFEST_FILE,
      `schemaVersion ${JSON.stringify(m.schemaVersion)} is not supported (expected ${String(SCHEMA_VERSION)})`,
    );
  }
  return m as unknown as Manifest;
}

export async function loadCatalog(
  source: DataSource,
  options: LoadOptions = {},
): Promise<CatalogEntry[]> {
  const file = fileFor("catalog", options);
  const catalog = await readJson(source, file);
  if (
    !Array.isArray(catalog) ||
    !catalog.every((e) => isRecord(e) && typeof e.id === "string")
  ) {
    throw new IconMatchDataError(file, "is not an array of catalog entries");
  }
  return catalog as CatalogEntry[];
}

export async function loadKeywordIndex(
  source: DataSource,
  options: LoadOptions = {},
): Promise<MiniSearch<KeywordDocument>> {
  const file = fileFor("keywordIndex", options);
  const text = await readText(source, file);
  try {
    return parseKeywordIndex(text);
  } catch (cause) {
    throw new IconMatchDataError(file, "is not a valid keyword index", {
      cause,
    });
  }
}

export async function loadSvgs(
  source: DataSource,
  options: LoadOptions = {},
): Promise<SvgArtifact> {
  const file = fileFor("svgs", options);
  const svgs = await readJson(source, file);
  if (!isRecord(svgs)) throw new IconMatchDataError(file, "is not an SVG map");
  return svgs as SvgArtifact;
}
