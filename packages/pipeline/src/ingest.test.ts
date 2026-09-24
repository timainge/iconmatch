import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTablerAdapter } from "./adapters/tabler.js";
import type { IconSetAdapter, RawIcon } from "./adapters/types.js";
import { humanise, ingest, writeIngest } from "./ingest.js";

const v = (body: string) => ({ body, width: 24, height: 24 });

function adapter(icons: RawIcon[], overrides: Partial<IconSetAdapter> = {}) {
  return {
    id: "test",
    license: {
      spdx: "MIT",
      url: "https://example.com",
      attributionRequired: false,
    },
    variants: ["outline", "filled"],
    load: () => Promise.resolve(icons),
    ...overrides,
  } satisfies IconSetAdapter;
}

const heart: RawIcon = {
  name: "heart",
  variants: { filled: v("hf"), outline: v("ho") },
  tags: ["love"],
  categories: ["shapes"],
};
const netflix: RawIcon = {
  name: "brand-netflix",
  variants: { outline: v("n") },
  tags: ["tv", "netflix"],
  categories: ["brand"],
  brand: true,
};
const letterA: RawIcon = {
  name: "square-letter-a",
  variants: { outline: v("a") },
  tags: [],
  categories: ["letters"],
  glyph: "letter",
};

describe("humanise", () => {
  it.each([
    ["heart", false, "Heart"],
    ["arrow-bar-to-down", false, "Arrow bar to down"],
    ["brand-netflix", true, "Netflix"],
    ["brand-google-drive", true, "Google drive"],
    ["brand-new", false, "Brand new"],
  ])("%s (brand=%s) -> %s", (name, brand, label) => {
    expect(humanise(name, brand)).toBe(label);
  });
});

describe("ingest", () => {
  it("builds §6.2 catalog entries sorted by id", async () => {
    const { catalog } = await ingest([adapter([netflix, letterA, heart])]);
    expect(catalog).toEqual([
      {
        id: "test:brand-netflix",
        set: "test",
        name: "brand-netflix",
        label: "Netflix",
        tags: ["tv", "netflix"],
        categories: ["brand"],
        variants: ["outline"],
        license: "MIT",
        brand: true,
      },
      {
        id: "test:heart",
        set: "test",
        name: "heart",
        label: "Heart",
        tags: ["love"],
        categories: ["shapes"],
        variants: ["outline", "filled"],
        license: "MIT",
      },
      {
        id: "test:square-letter-a",
        set: "test",
        name: "square-letter-a",
        label: "Square letter a",
        tags: [],
        categories: ["letters"],
        variants: ["outline"],
        license: "MIT",
        glyph: "letter",
      },
    ]);
  });

  it("puts SVG bodies in a separate map keyed by id then variant", async () => {
    const { catalog, svgs } = await ingest([adapter([heart, netflix])]);
    expect(svgs).toEqual({
      "test:brand-netflix": { outline: v("n") },
      "test:heart": { outline: v("ho"), filled: v("hf") },
    });
    expect(JSON.stringify(catalog)).not.toContain("body");
  });

  it("orders variants by adapter preference", async () => {
    const { catalog } = await ingest([
      adapter([heart], { variants: ["filled", "outline"] }),
    ]);
    expect(catalog[0]?.variants).toEqual(["filled", "outline"]);
  });

  it("skips deprecated icons", async () => {
    const { catalog } = await ingest([
      adapter([heart, { ...netflix, deprecated: true }]),
    ]);
    expect(catalog.map((e) => e.id)).toEqual(["test:heart"]);
  });

  it("fails on invalid icons and duplicate ids, listing every problem", async () => {
    const bad = { ...heart, name: "Bad_Name" };
    await expect(ingest([adapter([heart, heart, bad])])).rejects.toThrow(
      /2 problem\(s\):\ntest:heart: duplicate id\ntest:Bad_Name: name "Bad_Name" is not kebab-case/,
    );
  });

  it("prefixes ids with the adapter id across several sets", async () => {
    const { catalog } = await ingest([
      adapter([heart]),
      adapter([heart], { id: "other" }),
    ]);
    expect(catalog.map((e) => e.id)).toEqual(["other:heart", "test:heart"]);
  });
});

describe("writeIngest", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes catalog.json and svgs.json byte-identically across runs", async () => {
    dir = await mkdtemp(join(tmpdir(), "iconmatch-ingest-"));
    const read = async () => {
      const paths = await writeIngest(
        await ingest([adapter([netflix, heart])]),
        dir ?? "",
      );
      return [
        await readFile(paths.catalog, "utf8"),
        await readFile(paths.svgs, "utf8"),
      ];
    };
    const first = await read();
    const second = await read();
    expect(second).toEqual(first);
    const [catalog, svgs] = first;
    expect((JSON.parse(catalog ?? "") as unknown[]).length).toBe(2);
    expect(Object.keys(JSON.parse(svgs ?? "") as object)).toEqual([
      "test:brand-netflix",
      "test:heart",
    ]);
  });
});

describe("ingest on the installed Tabler packages", () => {
  it("ingests every concept without invariant problems", async () => {
    const { catalog, svgs } = await ingest([
      createTablerAdapter({ log: () => undefined }),
    ]);
    expect(catalog.length).toBeGreaterThanOrEqual(4500);
    expect(Object.keys(svgs)).toHaveLength(catalog.length);
    expect(
      catalog.every(
        (e) => e.variants.length === 1 && e.variants[0] === "outline",
      ),
    ).toBe(true);
    expect(catalog.find((e) => e.id === "tabler:brand-netflix")).toMatchObject({
      label: "Netflix",
      brand: true,
    });
  });
});
