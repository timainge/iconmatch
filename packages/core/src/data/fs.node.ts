import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafeFileName,
  IconMatchDataError,
  toArrayBuffer,
  type DataSource,
} from "./source.js";

/** Reads artifacts from a directory on disk (Node only). */
export function fsSource(dir: string): DataSource {
  return {
    async read(file) {
      assertSafeFileName(file);
      try {
        return toArrayBuffer(await readFile(join(dir, file)));
      } catch (cause) {
        throw new IconMatchDataError(file, `cannot read from ${dir}`, {
          cause,
        });
      }
    },
  };
}

/** Directory holding the artifacts shipped inside the `iconmatch` package. */
export const PACKAGED_DATA_DIR = fileURLToPath(
  new URL("../../data/", import.meta.url),
);

/** Reads the artifacts shipped inside the `iconmatch` package (Node only). */
export function packagedSource(): DataSource {
  return fsSource(PACKAGED_DATA_DIR);
}
