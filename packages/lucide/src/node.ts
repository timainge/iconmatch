/**
 * `@iconmatch/lucide/node`: the Lucide data shipped in this package, as a
 * `DataSource` for `@iconmatch/core` (Node only). In the browser, serve the
 * files under `@iconmatch/lucide/data/` and use `fetchSource` instead.
 */
import type { DataSource } from "@iconmatch/core";
import { fsSource } from "@iconmatch/core/node";
import { fileURLToPath } from "node:url";

/** Directory holding the Lucide artifacts shipped inside this package. */
export const LUCIDE_DATA_DIR = fileURLToPath(
  new URL("../data/", import.meta.url),
);

/** Reads the packaged Lucide artifacts (manifest, catalog, index, vectors, SVGs). */
export function lucideSource(): DataSource {
  return fsSource(LUCIDE_DATA_DIR);
}
