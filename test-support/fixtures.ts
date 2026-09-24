import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** Root of the committed test fixtures (see fixtures/README.md). */
export const FIXTURES_DIR = fileURLToPath(
  new URL("../fixtures/", import.meta.url),
);

/** Absolute path to a file or directory under `fixtures/`. */
export function fixturePath(...segments: string[]): string {
  return join(FIXTURES_DIR, ...segments);
}
