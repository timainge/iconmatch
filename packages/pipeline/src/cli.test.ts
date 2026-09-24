import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { main, type CliIo } from "./cli.js";
import { DEFAULT_CONFIG, resolveConfig } from "./config.js";

let dir: string;
let out: string[];
let err: string[];
let io: CliIo;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "iconmatch-cli-"));
  out = [];
  err = [];
  io = {
    cwd: dir,
    log: (m) => out.push(m),
    error: (m) => err.push(m),
    createEmbedder: () => createFakeEmbedder({ dims: 8 }),
  };
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// A config with an in-memory adapter, written as a real .ts config file.
const CONFIG = `export default {
  buildDir: "out",
  sets: [{
    id: "demo",
    license: { spdx: "MIT", url: "https://example.com", attributionRequired: false },
    variants: ["outline"],
    load: async () => [
      { name: "heart", variants: { outline: { body: "<path/>", width: 24, height: 24 } }, tags: ["love"], categories: ["shapes"] },
    ],
  }],
};
`;

describe("iconmatch-build main()", () => {
  it("runs ingest then index using iconmatch.config.ts from cwd", async () => {
    await writeFile(join(dir, "iconmatch.config.ts"), CONFIG);
    expect(await main(["ingest"], io)).toBe(0);
    expect(await main(["index"], io)).toBe(0);
    const catalog = JSON.parse(
      await readFile(join(dir, "out", "catalog.json"), "utf8"),
    ) as {
      id: string;
    }[];
    expect(catalog.map((e) => e.id)).toEqual(["demo:heart"]);
    expect(existsSync(join(dir, "out", "svgs.json"))).toBe(true);
    expect(existsSync(join(dir, "out", "keyword-index.json"))).toBe(true);
    expect(err).toEqual([]);
  });

  it("'all' runs implemented stages in order and reports pending ones", async () => {
    await writeFile(join(dir, "c.config.ts"), CONFIG);
    expect(
      await main(["all", "--config", "c.config.ts", "--build-dir", "b"], io),
    ).toBe(0);
    const stages = out
      .map((l) => l.split(":")[0])
      .filter((s, i, a) => a.indexOf(s) === i);
    expect(stages).toEqual(["ingest", "enrich", "embed", "index", "package"]);
    expect(out).toContain("enrich: skipped (not implemented yet)");
    expect(out).toContain("embed: 1 × 8 int8 (fake/hash-embedder)");
    for (const f of [
      "keyword-index.json",
      "vectors.bin",
      "vector-ids.json",
      "embed-meta.json",
    ]) {
      expect(existsSync(join(dir, "b", f)), f).toBe(true);
    }
  });

  it("--float32 stores float32 vectors", async () => {
    await writeFile(join(dir, "iconmatch.config.ts"), CONFIG);
    expect(await main(["ingest"], io)).toBe(0);
    expect(await main(["embed", "--float32"], io)).toBe(0);
    expect(out.at(-1)).toBe("embed: 1 × 8 float32 (fake/hash-embedder)");
  });

  it("fails clearly on pending stages, unknown stages, missing args and a missing --config", async () => {
    expect(await main(["package"], io)).toBe(1);
    expect(err.pop()).toBe('Stage "package" is not implemented yet.');
    expect(await main(["bogus"], io)).toBe(2);
    expect(err.pop()).toMatch(/^Unknown stage: bogus/);
    expect(await main([], io)).toBe(2);
    expect(await main(["--nope"], io)).toBe(2);
    expect(await main(["ingest", "--config", "missing.ts"], io)).toBe(1);
    expect(err.pop()).toMatch(/Config file not found/);
  });

  it("prints help", async () => {
    expect(await main(["--help"], io)).toBe(0);
    expect(out[0]).toMatch(/^Usage: iconmatch-build <stage>/);
  });
});

describe("resolveConfig", () => {
  it("fills defaults, defaulting sets to Tabler", () => {
    const c = resolveConfig({ enrich: { mode: "text" } });
    expect(c.sets.map((s) => s.id)).toEqual(["tabler"]);
    expect(c.buildDir).toBe("build");
    expect(c.enrich).toEqual({ ...DEFAULT_CONFIG.enrich, mode: "text" });
    expect(c.embed).toMatchObject({
      model: "Xenova/bge-small-en-v1.5",
      quantisation: "int8",
    });
    expect(c.embed.cacheDir).toMatch(/\.cache[\\/]iconmatch[\\/]models$/);
  });
});

// §11.1 M1: `iconmatch-build ingest` and `index` run and produce the §6.2/§6.5 files.
describe("iconmatch-build bin (end to end, real Tabler)", () => {
  it("produces catalog.json, svgs.json and keyword-index.json", async () => {
    const bin = fileURLToPath(
      new URL("../bin/iconmatch-build.js", import.meta.url),
    );
    const repo = fileURLToPath(new URL("../../../", import.meta.url));
    const run = promisify(execFile);
    for (const stage of ["ingest", "index"]) {
      await run(process.execPath, [bin, stage, "--build-dir", dir], {
        cwd: repo,
      });
    }
    const catalog = JSON.parse(
      await readFile(join(dir, "catalog.json"), "utf8"),
    ) as unknown[];
    expect(catalog.length).toBeGreaterThan(4500);
    expect(existsSync(join(dir, "svgs.json"))).toBe(true);
    expect(existsSync(join(dir, "keyword-index.json"))).toBe(true);
  });
});
