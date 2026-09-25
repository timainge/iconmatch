import { readFile, writeFile } from "node:fs/promises";

/**
 * Recorded query expansions (spec §9.3 config 6). The eval reads them from a
 * committed file so config 6 is reproducible offline; a live expander (the
 * `examples/query-expansion` Ollama hook) fills in queries that are missing.
 */
export interface ExpansionsFile {
  version: 1;
  /** Expander that produced them, e.g. `ollama:qwen2.5:7b-instruct`. */
  expander: string;
  expansions: Record<string, string[]>;
}

export async function readExpansions(
  file: string,
): Promise<ExpansionsFile | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as ExpansionsFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

export async function writeExpansions(
  file: string,
  data: ExpansionsFile,
): Promise<void> {
  const sorted = Object.fromEntries(
    Object.entries(data.expansions).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(
    file,
    JSON.stringify({ ...data, expansions: sorted }, null, 2) + "\n",
  );
}

/**
 * Resolves an expansion for every query: recorded ones first, then the live
 * expander (when given) for the rest. Throws if a query stays unresolved, so a
 * config 6 run never silently falls back to unexpanded search.
 */
export async function resolveExpansions(
  queries: string[],
  recorded: ExpansionsFile | undefined,
  live?: { name: string; expand: (q: string) => Promise<string[]> },
): Promise<{ file: ExpansionsFile; fetched: number }> {
  if (recorded && live && recorded.expander !== live.name)
    throw new Error(
      `recorded expansions come from ${recorded.expander}, not ${live.name}; use another --expansions file`,
    );
  const file: ExpansionsFile = {
    version: 1,
    expander: recorded?.expander ?? live?.name ?? "none",
    expansions: { ...recorded?.expansions },
  };
  let fetched = 0;
  const missing: string[] = [];
  for (const q of new Set(queries)) {
    if (file.expansions[q]) continue;
    if (!live) {
      missing.push(q);
      continue;
    }
    file.expansions[q] = await live.expand(q);
    fetched++;
  }
  if (missing.length > 0)
    throw new Error(
      `${String(missing.length)} quer${missing.length === 1 ? "y has" : "ies have"} no recorded expansion (e.g. "${missing[0] ?? ""}"); run with --expander ollama`,
    );
  return { file, fetched };
}
