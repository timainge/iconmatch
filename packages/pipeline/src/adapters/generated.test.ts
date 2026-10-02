import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixturePath } from "../../../../test-support/fixtures.js";
import { STYLE_GROUP } from "../generate/validate.js";
import { ingest } from "../ingest.js";
import { createGeneratedAdapter, generatedIcons } from "./generated.js";

describe("generated set from an approval file (spec §15.7)", () => {
  it("ingests approved icons as their own set, flagged generated, with the concept as a tag", async () => {
    const { catalog, svgs, sets } = await ingest([
      createGeneratedAdapter({
        file: fixturePath("generated", "approved.json"),
      }),
    ]);
    expect(catalog).toEqual([
      expect.objectContaining({
        id: "generated:beehive",
        set: "generated",
        tags: ["beekeeping", "bees", "honey"],
        categories: ["generated"],
        generated: true,
        license: "MIT",
      }),
    ]);
    // Bodies are re-validated and normalised to the shared stroke style.
    expect(svgs["generated:beehive"]?.outline?.body).toMatch(
      new RegExp(`^${STYLE_GROUP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    expect(sets?.[0]).toMatchObject({ id: "generated", license: "MIT" });
    expect(sets?.[0]?.licenseText).toContain("drawn by a local language model");
  });

  it("refuses an approval file with an icon that fails validation, naming it", () => {
    expect(() =>
      generatedIcons({
        version: 1,
        icons: [
          {
            name: "blob",
            concept: "x",
            body: '<circle cx="12" cy="12" r="8" fill="#000"/>',
            model: "m",
            promptVersion: "generate-v1",
            approvedAt: "2026-10-03",
          },
        ],
      }),
    ).toThrow(/1 invalid icon\(s\):\nblob: .*is filled/);
  });

  it("rejects a malformed approval file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "iconmatch-approved-"));
    try {
      const file = join(dir, "approved.json");
      await writeFile(file, JSON.stringify({ icons: [] }));
      await expect(createGeneratedAdapter({ file }).load()).rejects.toThrow(
        /expected \{ version: 1, icons: \[...\] \}/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
