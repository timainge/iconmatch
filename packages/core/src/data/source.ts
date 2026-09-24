/** Where artifacts come from (spec §7.0). Core never reads data on its own. */
export interface DataSource {
  read(file: string): Promise<ArrayBuffer>;
}

/** An artifact could not be read or parsed. Names the file. */
export class IconMatchDataError extends Error {
  override name = "IconMatchDataError";
  constructor(
    readonly file: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`${file}: ${message}`, options);
  }
}

/** Rejects absolute paths and `..` segments, so a source stays inside its root. */
export function assertSafeFileName(file: string): void {
  if (
    file === "" ||
    file.startsWith("/") ||
    /^[a-z]+:/i.test(file) ||
    file.split(/[\\/]/).includes("..")
  ) {
    throw new IconMatchDataError(
      file,
      "file name must be relative and stay inside the source",
    );
  }
}

export interface FetchSourceOptions {
  /** Defaults to `globalThis.fetch`, looked up when a file is read. */
  fetch?: (url: string) => Promise<Response>;
}

/** Reads artifacts over HTTP relative to `baseUrl` (e.g. "/iconmatch-data/"). */
export function fetchSource(
  baseUrl: string,
  options: FetchSourceOptions = {},
): DataSource {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    async read(file) {
      assertSafeFileName(file);
      const doFetch = options.fetch ?? ((url: string) => globalThis.fetch(url));
      let res: Response;
      try {
        res = await doFetch(base + file);
      } catch (cause) {
        throw new IconMatchDataError(file, `fetch failed from ${base}`, {
          cause,
        });
      }
      if (!res.ok) {
        throw new IconMatchDataError(
          file,
          `HTTP ${String(res.status)} from ${base}`,
        );
      }
      return res.arrayBuffer();
    },
  };
}

/** In-memory artifacts, e.g. bundled by the app or for tests. Strings are UTF-8 encoded. */
export function memorySource(
  files: Record<string, string | ArrayBuffer | Uint8Array>,
): DataSource {
  return {
    read(file) {
      const value = files[file];
      if (value === undefined) {
        return Promise.reject(
          new IconMatchDataError(file, "not found in memory source"),
        );
      }
      if (typeof value === "string")
        return Promise.resolve(toArrayBuffer(new TextEncoder().encode(value)));
      if (value instanceof Uint8Array)
        return Promise.resolve(toArrayBuffer(value));
      return Promise.resolve(value.slice(0));
    },
  };
}

/** Copies a view into a standalone ArrayBuffer. */
export function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}
