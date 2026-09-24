import type { IconMatch, SvgBody } from "iconmatch";
import { beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../test-support/fake-embedder.js";
import { tabler200FullSource } from "../../test-support/full-source.js";
import { createServer, type IconServer } from "./server.js";

// Spec §7.7: the server composition, exercised in-process (no port binding)
// with the fake embedder and fixture data.
let server: IconServer;
let embedder: ReturnType<typeof createFakeEmbedder>;

beforeAll(async () => {
  embedder = createFakeEmbedder({ dims: 32 });
  const { source } = await tabler200FullSource(
    createFakeEmbedder({ dims: 32 }),
  );
  server = await createServer({ source, embedder });
});

const get = (path: string) =>
  server.handle(new Request(`http://localhost${path}`));

describe("examples/server", () => {
  it("GET /search returns ranked IconMatch JSON", async () => {
    const res = await get("/search?q=Dog%20grooming&limit=5");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as IconMatch[];
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(5);
    expect(body.map((m) => m.id)).toContain("tabler:dog");
    expect(body[0]?.matchedOn.vector || body[0]?.matchedOn.keyword).toBe(true);
    expect(embedder.calls.at(-1)).toEqual({
      texts: ["Dog grooming"],
      kind: "query",
    });
  });

  it("GET /best returns one match or the lettered fallback", async () => {
    const best = (await (await get("/best?q=calendar")).json()) as IconMatch;
    // Fake-embedder ranking: any calendar icon, not a fallback.
    expect(best.id).toMatch(/^tabler:calendar/);
    expect(best.isFallback).toBeUndefined();
    const fallback = (await (
      await get("/best?q=%21%21%21")
    ).json()) as IconMatch;
    expect(fallback).toMatchObject({ id: "tabler:category", isFallback: true });
  });

  it("GET /icons/:id returns the SvgBody JSON", async () => {
    const body = (await (await get("/icons/tabler:heart")).json()) as SvgBody;
    expect(body).toMatchObject({ width: 24, height: 24 });
    expect(body.body).toContain("<path");
    const encoded = (await (
      await get("/icons/tabler%3Aheart")
    ).json()) as SvgBody;
    expect(encoded).toEqual(body);
  });

  it("GET /icons/:id.svg returns a rendered SVG", async () => {
    const res = await get("/icons/tabler:heart.svg?size=32&strokeWidth=1.5");
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    const svg = await res.text();
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('width="32"');
    expect(svg).toContain('stroke-width="1.5"');
  });

  it("returns 400, 404 and 405 for bad requests", async () => {
    expect((await get("/search")).status).toBe(400);
    expect((await get("/best?q=%20")).status).toBe(400);
    expect((await get("/icons/tabler:nope")).status).toBe(404);
    expect((await get("/nope")).status).toBe(404);
    const post = await server.handle(
      new Request("http://localhost/search?q=dog", { method: "POST" }),
    );
    expect(post.status).toBe(405);
  });
});
