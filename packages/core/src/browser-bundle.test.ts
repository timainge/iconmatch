import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleForBrowser } from "../../../test-support/bundle.js";

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Spec §7.0 rule 1 / §11.1 M1: `import { createIconMatcher } from "@iconmatch/core"`
// bundles for the browser with no Node built-ins and no transformers.js.
describe("browser bundle of the default entry", () => {
  it("contains no Node built-ins and no @huggingface/transformers", async () => {
    const report = await bundleForBrowser(entry("./index.ts"));
    expect(report.nodeImports).toEqual([]);
    expect(
      report.inputs.filter((f) => f.includes("@huggingface/transformers")),
    ).toEqual([]);
    expect(report.inputs.filter((f) => f.endsWith(".node.ts"))).toEqual([]);
    expect(report.inputs.some((f) => f.includes("minisearch"))).toBe(true);
  });

  it("detects transformers.js (control: the embedder-transformers subpath)", async () => {
    const report = await bundleForBrowser(entry("./embedders/transformers.ts"));
    expect(
      report.inputs.some((f) => f.includes("@huggingface/transformers")),
    ).toBe(true);
  });

  it("detects Node built-ins (control: the iconmatch/node entry)", async () => {
    const report = await bundleForBrowser(entry("./node.ts"));
    expect(report.nodeImports).toEqual(
      expect.arrayContaining(["node:fs/promises", "node:path", "node:url"]),
    );
  });
});
