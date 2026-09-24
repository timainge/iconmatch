import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Embedder } from "../packages/core/src/types.js";
import { tabler200FullSource } from "./full-source.js";

/** Writes the full 200-icon data directory (vectors from `embedder`) to a temp dir. */
export async function writeTabler200DataDir(
  embedder: Embedder,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "iconmatch-data-"));
  const { files } = await tabler200FullSource(embedder);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files))
    await writeFile(join(dir, name), content);
  return dir;
}
