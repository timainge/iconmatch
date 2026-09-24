import { describe, expect, it } from "vitest";
import {
  assertSafeFileName,
  fetchSource,
  IconMatchDataError,
  memorySource,
} from "./source.js";

const text = (buf: ArrayBuffer) => new TextDecoder().decode(buf);

describe("memorySource", () => {
  it("reads strings, bytes and buffers", async () => {
    const src = memorySource({
      "a.json": "[1]",
      "b.bin": new Uint8Array([1, 2]),
      "c.bin": new Uint8Array([3]).buffer,
    });
    expect(text(await src.read("a.json"))).toBe("[1]");
    expect([...new Uint8Array(await src.read("b.bin"))]).toEqual([1, 2]);
    expect([...new Uint8Array(await src.read("c.bin"))]).toEqual([3]);
  });

  it("returns copies, so callers cannot mutate the source", async () => {
    const bytes = new Uint8Array([7]);
    const src = memorySource({ "x.bin": bytes });
    new Uint8Array(await src.read("x.bin"))[0] = 0;
    expect([...new Uint8Array(await src.read("x.bin"))]).toEqual([7]);
  });

  it("names the missing file", async () => {
    await expect(memorySource({}).read("catalog.json")).rejects.toThrow(
      new IconMatchDataError("catalog.json", "not found in memory source"),
    );
  });
});

describe("fetchSource", () => {
  function fakeFetch(status = 200, body = "ok") {
    const urls: string[] = [];
    const fetch = (url: string) => {
      urls.push(url);
      return Promise.resolve(new Response(body, { status }));
    };
    return { fetch, urls };
  }

  it("fetches files relative to the base URL, with or without trailing slash", async () => {
    const f = fakeFetch();
    await fetchSource("/iconmatch-data", f).read("catalog.json");
    await fetchSource("https://cdn.example/data/", f).read("svgs.json");
    expect(f.urls).toEqual([
      "/iconmatch-data/catalog.json",
      "https://cdn.example/data/svgs.json",
    ]);
  });

  it("does not fetch until a file is read", () => {
    const f = fakeFetch();
    fetchSource("/d/", f);
    expect(f.urls).toEqual([]);
  });

  it("returns the body and rejects non-OK responses naming the file", async () => {
    expect(
      text(await fetchSource("/d/", fakeFetch(200, "hi")).read("a.json")),
    ).toBe("hi");
    await expect(
      fetchSource("/d/", fakeFetch(404)).read("a.json"),
    ).rejects.toThrow("a.json: HTTP 404 from /d/");
  });

  it("wraps network errors", async () => {
    const src = fetchSource("/d/", {
      fetch: () => Promise.reject(new Error("offline")),
    });
    await expect(src.read("a.json")).rejects.toBeInstanceOf(IconMatchDataError);
  });
});

describe("assertSafeFileName", () => {
  it.each(["catalog.json", "licenses/tabler.txt"])("allows %s", (f) => {
    expect(() => {
      assertSafeFileName(f);
    }).not.toThrow();
  });

  it.each([
    "",
    "/etc/passwd",
    "../secret",
    "a/../../b",
    "a\\..\\b",
    "http://x/y",
    "C:\\x",
  ])("rejects %j", (f) => {
    expect(() => {
      assertSafeFileName(f);
    }).toThrow(IconMatchDataError);
  });
});
