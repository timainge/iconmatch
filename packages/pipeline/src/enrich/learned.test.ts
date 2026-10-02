import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChoiceEntry } from "@iconmatch/core";
import { describe, expect, it } from "vitest";
import { learnedConcepts, readChoiceExports } from "./learned.js";

const c = (query: string, iconId: string): ChoiceEntry => ({
  query,
  iconId,
  count: 1,
  seq: 1,
});

describe("learnedConcepts (spec §15.5 variant 3)", () => {
  const ids = new Set(["t:heart", "t:dog"]);

  it("keeps a name once at least minUsers distinct users chose the icon for it", () => {
    const exports = [
      [
        c("valentines", "t:heart"),
        c("valentines", "t:heart"),
        c("doggo", "t:dog"),
      ],
      [c("valentines", "t:heart"), c("my pup", "t:dog")],
      [c("doggo", "t:dog")],
    ];
    expect(learnedConcepts(exports, ids)).toEqual(
      new Map([
        ["t:dog", ["doggo"]],
        ["t:heart", ["valentines"]],
      ]),
    );
    // One user's repeats count once; minUsers 1 keeps single-user names too.
    expect(learnedConcepts(exports, ids, { minUsers: 1 }).get("t:dog")).toEqual(
      ["doggo", "my pup"],
    );
  });

  it("ignores unknown icons and caps concepts per icon, most widely chosen first", () => {
    const exports = [
      [c("a", "t:heart"), c("b", "t:heart"), c("x", "t:gone")],
      [c("a", "t:heart"), c("b", "t:heart"), c("x", "t:gone")],
      [c("b", "t:heart")],
    ];
    const learned = learnedConcepts(exports, ids, { maxConcepts: 1 });
    expect(learned).toEqual(new Map([["t:heart", ["b"]]]));
  });

  it("reads an array of exports and rejects anything else", async () => {
    const dir = await mkdtemp(join(tmpdir(), "iconmatch-learned-"));
    try {
      const good = join(dir, "good.json");
      await writeFile(good, JSON.stringify([[c("a", "t:heart")]]));
      expect(await readChoiceExports(good)).toHaveLength(1);
      const bad = join(dir, "bad.json");
      await writeFile(bad, JSON.stringify([{ query: "a" }]));
      await expect(readChoiceExports(bad)).rejects.toThrow(
        /expected an array of choice exports/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
