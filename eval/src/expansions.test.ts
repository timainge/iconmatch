import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readExpansions,
  resolveExpansions,
  writeExpansions,
  type ExpansionsFile,
} from "./expansions.js";

const recorded: ExpansionsFile = {
  version: 1,
  expander: "ollama:m",
  expansions: { Admin: ["clipboard", "folder"] },
};

describe("resolveExpansions (config 6)", () => {
  it("uses recorded expansions and fetches only the missing ones live", async () => {
    const asked: string[] = [];
    const { file, fetched } = await resolveExpansions(
      ["Admin", "Life", "Admin"],
      recorded,
      {
        name: "ollama:m",
        expand: (q) => {
          asked.push(q);
          return Promise.resolve(["heart", "tree"]);
        },
      },
    );
    expect(asked).toEqual(["Life"]);
    expect(fetched).toBe(1);
    expect(file.expansions).toEqual({
      Admin: ["clipboard", "folder"],
      Life: ["heart", "tree"],
    });
  });

  it("fails loudly on a query with no recorded expansion and no live expander", async () => {
    await expect(resolveExpansions(["Life"], recorded)).rejects.toThrow(
      /1 query has no recorded expansion \(e\.g\. "Life"\)/,
    );
  });

  it("refuses to mix expanders in one file", async () => {
    await expect(
      resolveExpansions(["Life"], recorded, {
        name: "ollama:other",
        expand: () => Promise.resolve([]),
      }),
    ).rejects.toThrow(/come from ollama:m, not ollama:other/);
  });

  it("round-trips through the file, sorted by query; a missing file reads as undefined", async () => {
    const dir = await mkdtemp(join(tmpdir(), "iconmatch-exp-"));
    try {
      const file = join(dir, "expansions.json");
      expect(await readExpansions(file)).toBeUndefined();
      await writeExpansions(file, {
        ...recorded,
        expansions: { Zoo: ["lion"], Admin: ["stamp"] },
      });
      const back = await readExpansions(file);
      expect(Object.keys(back?.expansions ?? {})).toEqual(["Admin", "Zoo"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
