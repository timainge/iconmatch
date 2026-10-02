import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  fsSource,
  PACKAGED_DATA_DIR,
  packagedSource,
} from "@iconmatch/core/node";
import { IconMatchDataError } from "./source.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

it("fsSource reads files from a directory and names missing ones", async () => {
  dir = await mkdtemp(join(tmpdir(), "iconmatch-fs-"));
  await writeFile(join(dir, "catalog.json"), "[]");
  const src = fsSource(dir);
  expect(new TextDecoder().decode(await src.read("catalog.json"))).toBe("[]");
  await expect(src.read("missing.json")).rejects.toThrow(IconMatchDataError);
  await expect(src.read("../outside.json")).rejects.toThrow(/stay inside/);
});

it("packagedSource reads from packages/core/data", async () => {
  expect(
    PACKAGED_DATA_DIR.endsWith(["packages", "core", "data", ""].join(sep)),
  ).toBe(true);
  await expect(packagedSource().read("nope.json")).rejects.toThrow(
    PACKAGED_DATA_DIR,
  );
});
