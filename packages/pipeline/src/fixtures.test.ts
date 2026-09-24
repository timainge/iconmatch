import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { fixturePath } from "../../../test-support/fixtures.js";
import { createTablerAdapter } from "./adapters/tabler.js";
import {
  FIXTURE_SIZE,
  fixtureFiles,
  GLYPH_NAMES,
  PINNED_NAMES,
  selectFixture,
} from "./fixtures.js";
import { ingest, type IngestResult } from "./ingest.js";

describe("fixtures/tabler-200", () => {
  let fixture: IngestResult;
  beforeAll(async () => {
    fixture = selectFixture(
      await ingest([createTablerAdapter({ log: () => undefined })]),
    );
  });

  it("has 200 icons: pinned concepts, square glyphs a–z/0–9 and a sample", () => {
    expect(fixture.catalog).toHaveLength(FIXTURE_SIZE);
    const names = new Set(fixture.catalog.map((e) => e.name));
    for (const n of [...PINNED_NAMES, ...GLYPH_NAMES])
      expect(names.has(n)).toBe(true);
    expect(fixture.catalog.filter((e) => e.glyph)).toHaveLength(
      GLYPH_NAMES.length,
    );
    expect(
      fixture.catalog.filter((e) => e.brand).length,
    ).toBeGreaterThanOrEqual(4);
    expect(Object.keys(fixture.svgs)).toEqual(fixture.catalog.map((e) => e.id));
  });

  it("is up to date with the installed packages and keyword options (run `npm run fixtures`)", async () => {
    for (const [name, text] of Object.entries(fixtureFiles(fixture))) {
      expect(
        await readFile(fixturePath("tabler-200", name), "utf8"),
        name,
      ).toBe(text);
    }
  });

  it("rejects a catalog missing a pinned icon", () => {
    const without = {
      catalog: fixture.catalog.filter((e) => e.name !== "dog"),
      svgs: fixture.svgs,
    };
    expect(() => selectFixture(without)).toThrow(
      "Fixture icon tabler:dog is not in the catalog",
    );
  });
});
