import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { itSlow } from "../../../test-support/tiers.js";
import {
  checkPackFiles,
  compositionSizes,
  formatCompositionSizes,
  packFiles,
  REQUIRED_PACK_FILES,
} from "./pack-check.js";

describe("checkPackFiles (spec §11.1 M5)", () => {
  it("accepts exactly the intended files", () => {
    expect(
      checkPackFiles([
        ...REQUIRED_PACK_FILES,
        "dist/fuse.js",
        "dist/fuse.d.ts",
        "data/vectors.bin",
        "data/vector-ids.json",
      ]),
    ).toEqual([]);
  });

  it("flags sources, tests, maps, stray files and missing required files", () => {
    const problems = checkPackFiles([
      ...REQUIRED_PACK_FILES.filter((f) => f !== "data/manifest.json"),
      "src/index.ts",
      "dist/matcher.test.js",
      "dist/index.js.map",
      "data/enrichment.jsonl",
      "tsconfig.build.json",
    ]);
    expect(problems).toEqual([
      "unexpected file: src/index.ts",
      "unexpected file: dist/matcher.test.js",
      "unexpected file: dist/index.js.map",
      "unexpected file: data/enrichment.jsonl",
      "unexpected file: tsconfig.build.json",
      "missing file: data/manifest.json",
    ]);
  });
});

describe("compositionSizes", () => {
  it("sizes the browser download and the server bundle, counting one ONNX variant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "iconmatch-sizes-"));
    try {
      const data = join(dir, "data");
      const model = join(dir, "model");
      await mkdir(join(data, "licenses"), { recursive: true });
      await mkdir(join(model, "onnx"), { recursive: true });
      await writeFile(join(data, "catalog.json"), "a".repeat(1000));
      await writeFile(join(data, "keyword-index.json"), "b".repeat(500));
      await writeFile(join(data, "svgs.json"), "c".repeat(2000));
      await writeFile(join(data, "licenses", "tabler.txt"), "MIT");
      await writeFile(join(model, "tokenizer.json"), "t".repeat(100));
      await writeFile(
        join(model, "onnx", "model_quantized.onnx"),
        "q".repeat(300),
      );
      await writeFile(join(model, "onnx", "model.onnx"), "f".repeat(1200));
      const s = await compositionSizes(data, model);
      expect(s.browser.raw).toBe(1500);
      expect(s.browser.gzip).toBeLessThan(200);
      expect(s.server.data.raw).toBe(3503);
      expect(s.server.model).toBe(400);
      expect(s.server.total).toBe(3903);
      expect((await compositionSizes(data, model, "fp32")).server.model).toBe(
        1300,
      );
      expect(formatCompositionSizes(s)).toContain("| browser-client |");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// §11.1 M5: `npm pack --dry-run` of packages/core lists only the intended files.
itSlow(
  "the real npm pack of iconmatch contains only intended files",
  async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    await promisify(execFile)("npm", ["run", "build"], { cwd: root });
    const pack = await packFiles(root);
    expect(checkPackFiles(pack.paths)).toEqual([]);
  },
  120_000,
);
