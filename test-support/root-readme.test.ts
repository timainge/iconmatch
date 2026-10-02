import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readmeExamplePaths, syncReadme } from "./readme.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p: string) => readFile(join(root, p), "utf8");

interface Report {
  hit3: number;
  mrr: number;
  fallback: { recall: number };
  perGroup: Record<string, { hit3: number }>;
}
const testReport = async (evalDir: string, date: string, config: string) =>
  (
    JSON.parse(await read(`${evalDir}results/${date}-${config}-test.json`)) as {
      report: Report;
    }
  ).report;

/** Relative link targets in a markdown file (no scheme, no pure anchors). */
function relativeLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1] ?? "")
    .filter((href) => !/^[a-z]+:|^#/.test(href))
    .map((href) => href.split("#")[0] ?? "");
}

// Spec §15.1: the root README is the GitHub landing page.
describe("README.md (repository root)", () => {
  it("has its example blocks in sync with examples/readme (run `npm run readme`)", async () => {
    const text = await read("README.md");
    expect(readmeExamplePaths(text)).toEqual([
      "examples/readme/quick-start.ts",
    ]);
    expect(await syncReadme(text, root)).toBe(text);
  });

  it("quotes only reviewed eval numbers, matching the committed test-split results", async () => {
    const text = await read("README.md");
    const cited =
      /\]\((eval\/(?:v\d+\/)?)results\/(\d{4}-\d{2}-\d{2})\.md\)/.exec(text);
    expect(cited).not.toBeNull();
    const [, evalDir = "", date = ""] = cited ?? [];
    expect(existsSync(join(root, evalDir, "REVIEWED"))).toBe(true);
    const hybrid = await testReport(evalDir, date, "baseline");
    const keyword = await testReport(evalDir, date, "keyword");
    const row = (label: string, value: string) =>
      new RegExp(`\\| ${label}\\s*\\| ${value.replace(".", "\\.")}\\s*\\|`);
    expect(text).toMatch(
      row("Hit@3: an acceptable icon in the top 3", hybrid.hit3.toFixed(3)),
    );
    expect(text).toMatch(row("MRR", hybrid.mrr.toFixed(3)));
    expect(text).toMatch(
      row(
        "Fallback recall: names with no suitable icon that fall back",
        hybrid.fallback.recall.toFixed(2),
      ),
    );
    expect(text).toMatch(
      row(
        "Keyword-only Hit@3 \\(browser with the server down\\)",
        keyword.hit3.toFixed(3),
      ),
    );
    expect(text).toContain(
      `held-out Hit@3 ${(hybrid.perGroup.abstract?.hit3 ?? -1).toFixed(2)} for that group`,
    );
  });

  it("links to npm, CI, the package README, the eval results and the roadmap; every relative link resolves", async () => {
    const text = await read("README.md");
    for (const target of [
      "https://www.npmjs.com/package/@iconmatch/core",
      "https://github.com/timainge/iconmatch/actions/workflows/ci.yml",
      "](packages/core/README.md)",
      "](docs/plan.md#15-post-v1-work-v02)",
    ])
      expect(text).toContain(target);
    for (const href of relativeLinks(text))
      expect(existsSync(join(root, href)), href).toBe(true);
  });
});

// npm renders the package README away from the repository, so it must not
// rely on relative links into the repo.
describe("packages/core/README.md links", () => {
  it("has no relative links that would break on npm", async () => {
    const text = await read("packages/core/README.md");
    const pkgDir = dirname(join(root, "packages/core/README.md"));
    for (const href of relativeLinks(text))
      expect(existsSync(join(pkgDir, href)), href).toBe(true);
  });
});

describe("packages/lucide/README.md", () => {
  it("has its example in sync, no relative links, and both licence notices", async () => {
    const text = await read("packages/lucide/README.md");
    expect(readmeExamplePaths(text)).toEqual(["examples/readme/lucide.ts"]);
    expect(await syncReadme(text, root)).toBe(text);
    expect(relativeLinks(text)).toEqual([]);
    expect(text).toContain("ISC licence");
    expect(text).toContain("Tabler Icons");
  });
});
