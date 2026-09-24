import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Enrichment } from "./schema.js";

/**
 * `enrichment.jsonl`: one Enrichment per line, appended as results arrive so
 * an interrupted run resumes where it stopped (spec §6.3). Keyed by
 * `inputHash`; malformed lines (e.g. a torn last write) are skipped.
 */
export async function readEnrichmentCache(
  file: string,
): Promise<{ byHash: Map<string, Enrichment>; malformed: number }> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { byHash: new Map(), malformed: 0 };
    throw e;
  }
  const byHash = new Map<string, Enrichment>();
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as Partial<Enrichment>;
      if (typeof e.inputHash !== "string" || typeof e.id !== "string")
        throw new Error("missing keys");
      byHash.set(e.inputHash, e as Enrichment);
    } catch {
      malformed++;
    }
  }
  return { byHash, malformed };
}

export async function appendEnrichment(
  file: string,
  enrichment: Enrichment,
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(enrichment) + "\n");
}
