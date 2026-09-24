import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { bundleForBrowser } from "../../test-support/bundle.js";
import { createFakeEmbedder } from "../../test-support/fake-embedder.js";
import { tabler200FullSource } from "../../test-support/full-source.js";
import { createServer, type IconServer } from "../server/server.js";
import { createIconClient, type Fetch, type IconChoice } from "./client.js";

// Spec §7.7: browser client against the in-process server; must work with
// the remote down and never import the transformers subpath.
let server: IconServer;
let files: Record<string, string | Uint8Array>;

beforeAll(async () => {
  const full = await tabler200FullSource(createFakeEmbedder({ dims: 32 }));
  files = full.files;
  server = await createServer({
    source: full.source,
    embedder: createFakeEmbedder({ dims: 32 }),
  });
});

/** Routes /data/* to fixture files and /api/* to the server, unless the API is down. */
function network(apiDown = false) {
  const urls: string[] = [];
  const doFetch: Fetch = (url) => {
    urls.push(url);
    if (url.startsWith("/data/")) {
      const body = files[url.slice("/data/".length)];
      return Promise.resolve(
        body === undefined
          ? new Response("", { status: 404 })
          : new Response(
              typeof body === "string" ? body : new Uint8Array(body),
            ),
      );
    }
    if (url.startsWith("/api/")) {
      if (apiDown) return Promise.reject(new TypeError("Failed to fetch"));
      return server.handle(
        new Request(`http://localhost${url.slice("/api".length)}`),
      );
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  return { urls, doFetch };
}

describe("examples/browser-client", () => {
  it("suggests via remote + keyword search and renders SVGs from the server", async () => {
    const net = network();
    const client = await createIconClient({
      dataUrl: "/data/",
      apiUrl: "/api",
      fetch: net.doFetch,
      persist: () => undefined,
    });
    const candidates = await client.review("Dog grooming");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(20);
    expect(candidates.some((c) => c.matchedOn.remote)).toBe(true);
    expect(await client.svg("tabler:heart", { size: 20 })).toContain(
      'width="20"',
    );
    // Only the catalog and keyword index are downloaded, never vectors or a model.
    expect(net.urls.filter((u) => u.startsWith("/data/")).sort()).toEqual([
      "/data/catalog.json",
      "/data/keyword-index.json",
    ]);
  });

  it("review → pick → persist { query, iconId }", async () => {
    const saved: IconChoice[] = [];
    const client = await createIconClient({
      dataUrl: "/data/",
      apiUrl: "/api",
      fetch: network().doFetch,
      persist: (c) => {
        saved.push(c);
      },
    });
    const [, second] = await client.review("Groceries");
    if (!second) throw new Error("expected at least two candidates");
    await client.choose("Groceries", second.id);
    expect(saved).toEqual([{ query: "Groceries", iconId: second.id }]);
    await expect(client.choose("Groceries", "tabler:nope")).rejects.toThrow(
      "Unknown icon id",
    );
    expect(saved).toHaveLength(1);
  });

  it("keeps working keyword-only when the remote is down", async () => {
    const errors: unknown[] = [];
    const client = await createIconClient({
      dataUrl: "/data/",
      apiUrl: "/api",
      fetch: network(true).doFetch,
      persist: () => undefined,
      onRemoteError: (e) => errors.push(e),
    });
    const candidates = await client.review("dog");
    expect(candidates[0]?.id).toBe("tabler:dog");
    expect(
      candidates.every((c) => c.matchedOn.keyword && !c.matchedOn.remote),
    ).toBe(true);
    expect((await client.suggest("Misc")).isFallback).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("bundles for the browser without transformers.js or Node built-ins", async () => {
    const report = await bundleForBrowser(
      fileURLToPath(new URL("./client.ts", import.meta.url)),
    );
    expect(report.nodeImports).toEqual([]);
    expect(
      report.inputs.filter((f) => f.includes("@huggingface/transformers")),
    ).toEqual([]);
    expect(report.inputs.filter((f) => f.includes("embedders/"))).toEqual([]);
  });
});
