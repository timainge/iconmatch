import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseKeywordIndex, type CatalogEntry } from "iconmatch";
import { afterEach, expect, it } from "vitest";
import { runIndex } from "./index.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const heart: CatalogEntry = {
  id: "t:heart",
  set: "t",
  name: "heart",
  label: "Heart",
  tags: ["love"],
  categories: ["shapes"],
  variants: ["outline"],
  license: "MIT",
};

it("reads catalog.json and writes a loadable keyword-index.json", async () => {
  dir = await mkdtemp(join(tmpdir(), "iconmatch-index-"));
  await writeFile(join(dir, "catalog.json"), JSON.stringify([heart]));
  const out = await runIndex(dir);
  expect(out).toBe(join(dir, "keyword-index.json"));
  const json = await readFile(out, "utf8");
  expect(
    parseKeywordIndex(json)
      .search("loves")
      .map((r) => r.id as string),
  ).toEqual(["t:heart"]);
  await runIndex(dir);
  expect(await readFile(out, "utf8")).toBe(json);
});
