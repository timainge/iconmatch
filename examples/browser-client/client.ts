/**
 * Reference composition (spec §7.7): a browser client that searches with the
 * keyword index, asks the server for semantic results and SVGs, and lets the
 * user review and override the suggested icon. It never downloads a model.
 */
import {
  createIconMatcher,
  fetchSource,
  loadCatalog,
  loadKeywordIndex,
  type IconMatch,
  type IconMatcher,
  type SvgBody,
  type SvgOptions,
} from "@iconmatch/core";

export type Fetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<Response>;

/** The user's decision for a category, e.g. saved with the category record. */
export interface IconChoice {
  query: string;
  iconId: string;
}

export interface ClientOptions {
  /** Where catalog.json and keyword-index.json are served, e.g. "/iconmatch-data/". */
  dataUrl: string;
  /** The server composition's base URL, e.g. "/api/icons". */
  apiUrl: string;
  /** Saves a reviewed choice. */
  persist: (choice: IconChoice) => void | Promise<void>;
  fetch?: Fetch;
  remoteTimeoutMs?: number;
  onRemoteError?: (error: unknown) => void;
}

export interface IconClient {
  /** Best icon for a new category (may be the lettered fallback). */
  suggest(query: string): Promise<IconMatch>;
  /** Candidates for the review/override picker. */
  review(query: string, limit?: number): Promise<IconMatch[]>;
  /** Records the user's pick. Rejects ids not in the catalog. */
  choose(query: string, iconId: string): Promise<void>;
  svg(id: string, options?: SvgOptions): Promise<string>;
}

async function getJson<T>(
  doFetch: Fetch,
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await doFetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`${url}: HTTP ${String(res.status)}`);
  return (await res.json()) as T;
}

export async function createIconClient(
  options: ClientOptions,
): Promise<IconClient> {
  const doFetch: Fetch =
    options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const api = options.apiUrl.replace(/\/$/, "");
  const source = fetchSource(options.dataUrl, { fetch: (url) => doFetch(url) });
  const [catalog, keywordIndex] = await Promise.all([
    loadCatalog(source),
    loadKeywordIndex(source),
  ]);

  const matcher: IconMatcher = await createIconMatcher({
    catalog,
    keywordIndex,
    remoteSearch: (q, { limit, signal }) =>
      getJson<IconMatch[]>(
        doFetch,
        `${api}/search?q=${encodeURIComponent(q)}&limit=${String(limit)}`,
        signal,
      ),
    svgs: {
      get: (id, variant) =>
        getJson<SvgBody>(
          doFetch,
          `${api}/icons/${encodeURIComponent(id)}?variant=${variant}`,
        ),
    },
    ...(options.remoteTimeoutMs !== undefined && {
      remoteTimeoutMs: options.remoteTimeoutMs,
    }),
    ...(options.onRemoteError && { onRemoteError: options.onRemoteError }),
  });

  return {
    suggest: (query) => matcher.best(query),
    review: (query, limit = 20) => matcher.search(query, { limit }),
    async choose(query, iconId) {
      if (!matcher.get(iconId)) throw new Error(`Unknown icon id: ${iconId}`);
      await options.persist({ query, iconId });
    },
    svg: (id, svgOptions) => matcher.svg(id, svgOptions),
  };
}
