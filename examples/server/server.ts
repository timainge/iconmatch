/**
 * Reference composition (spec §7.7): a Node server that embeds, searches and
 * serves SVGs. Framework-agnostic: mount `handle` in any Request/Response host.
 */
import {
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  loadManifest,
  loadSvgs,
  loadVectors,
  resolveVariant,
  svgsFromArtifact,
  type DataSource,
  type Embedder,
  type VariantName,
} from "@iconmatch/core";
import { createTransformersEmbedder } from "@iconmatch/core/embedder-transformers";
import { packagedSource } from "@iconmatch/core/node";

export interface ServerOptions {
  /** Default: the data shipped in the package. */
  source?: DataSource;
  /** Default: transformers.js with the manifest's model (loaded on first search). */
  embedder?: Embedder;
}

export interface IconServer {
  handle(request: Request): Promise<Response>;
  /** The embedder in use (lazy: loads its model on the first text search). */
  embedder: Embedder;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
const error = (status: number, message: string) =>
  json({ error: message }, status);

export async function createServer(
  options: ServerOptions = {},
): Promise<IconServer> {
  const source = options.source ?? packagedSource();
  const manifest = await loadManifest(source);
  const [catalog, keywordIndex, vectors, svgArtifact] = await Promise.all([
    loadCatalog(source, { manifest }),
    loadKeywordIndex(source, { manifest }),
    loadVectors(source, manifest),
    loadSvgs(source, { manifest }),
  ]);
  const svgs = svgsFromArtifact(svgArtifact);
  const embedder =
    options.embedder ??
    createTransformersEmbedder({ model: manifest.embedding?.model ?? "" });
  const matcher = await createIconMatcher({
    catalog,
    keywordIndex,
    vectors,
    svgs,
    manifest,
    embedder,
  });

  async function route(url: URL): Promise<Response> {
    const q = url.searchParams.get("q");
    if (url.pathname === "/search" || url.pathname === "/best") {
      if (q === null || q.trim() === "")
        return error(400, "Missing query parameter q");
      if (url.pathname === "/best") return json(await matcher.best(q));
      const limit = Number(url.searchParams.get("limit") ?? "20");
      return json(
        await matcher.search(q, { limit: Number.isFinite(limit) ? limit : 20 }),
      );
    }
    const icon = /^\/icons\/([^/]+?)(\.svg)?$/.exec(url.pathname);
    if (!icon?.[1]) return error(404, "Not found");
    const id = decodeURIComponent(icon[1]);
    const entry = matcher.get(id);
    if (!entry) return error(404, `Unknown icon id: ${id}`);
    const variant = (url.searchParams.get("variant") ?? undefined) as
      VariantName | undefined;
    if (!icon[2])
      return json(await svgs.get(id, resolveVariant(entry, variant)));
    const size = url.searchParams.get("size");
    const stroke = url.searchParams.get("strokeWidth");
    const svg = await matcher.svg(id, {
      ...(variant && { variant }),
      ...(size !== null && { size: Number(size) }),
      ...(stroke !== null && { strokeWidth: Number(stroke) }),
    });
    return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
  }

  return {
    embedder,
    async handle(request) {
      if (request.method !== "GET") return error(405, "Method not allowed");
      try {
        return await route(new URL(request.url));
      } catch (e) {
        return error(500, e instanceof Error ? e.message : String(e));
      }
    },
  };
}
