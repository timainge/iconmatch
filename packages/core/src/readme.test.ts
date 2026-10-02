import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_CONFIDENCE } from "./matcher.js";
import {
  readmeExamplePaths,
  syncReadme,
} from "../../../test-support/readme.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const readme = () => readFile(`${root}packages/core/README.md`, "utf8");

// §11.1 M5: README examples are type-checked. Each block is a verbatim copy
// of a file under examples/readme/, which the root tsconfig type-checks.
describe("packages/core/README.md", () => {
  it("has its example blocks in sync with examples/readme (run `npm run readme`)", async () => {
    const text = await readme();
    expect(readmeExamplePaths(text)).toEqual([
      "examples/readme/quick-start.ts",
      "examples/readme/browser.ts",
      "examples/readme/expansion.ts",
      "examples/readme/choices.ts",
    ]);
    expect(await syncReadme(text, root)).toBe(text);
  });

  it("includes the Tabler MIT notice verbatim (§8)", async () => {
    const license = (
      await readFile(`${root}node_modules/@tabler/icons/LICENSE`, "utf8")
    ).trim();
    expect(await readme()).toContain(license);
  });

  it("notes brand trademarks (§6.1.3) and lower keyword-only quality (§7.2.7)", async () => {
    const text = await readme();
    expect(text).toMatch(/third-party trademarks/);
    expect(text).toMatch(
      /\*\*Keyword-only use\*\*.*quality is noticeably lower/s,
    );
  });

  it("cites only reviewed eval numbers, matching the committed test-split results", async () => {
    const text = await readme();
    // Numbers come from one reviewed eval revision (spec §14): the README
    // links its results table, and its REVIEWED marker must exist.
    const cited = /`(eval\/(?:v\d+\/)?)results\/(\d{4}-\d{2}-\d{2})\.md`/.exec(
      text,
    );
    expect(cited).not.toBeNull();
    const [, evalDir = "", date = ""] = cited ?? [];
    await expect(readFile(`${root}${evalDir}REVIEWED`)).resolves.toBeDefined();
    const result = async (config: string) =>
      (
        JSON.parse(
          await readFile(
            `${root}${evalDir}results/${date}-${config}-test.json`,
            "utf8",
          ),
        ) as {
          minConfidence: number;
          report: {
            n: number;
            hit3: number;
            mrr: number;
            fallback: { recall: number };
          };
        }
      ).report;
    const hybrid = await result("baseline");
    const keyword = await result("keyword");
    expect(text).toContain(
      `**Hybrid search:** Hit@3 ${hybrid.hit3.toFixed(3)} (an acceptable icon in the top 3), MRR ${hybrid.mrr.toFixed(3)}.`,
    );
    expect(text).toContain(
      `**Keyword-only:** Hit@3 ${keyword.hit3.toFixed(3)}.`,
    );
    expect(text).toContain(
      `fallback recall ${hybrid.fallback.recall.toFixed(2)} at \`minConfidence\` ${String(DEFAULT_MIN_CONFIDENCE)}`,
    );
    expect(text).toContain(
      `\`minConfidence\` (default **${DEFAULT_MIN_CONFIDENCE.toFixed(2)}**)`,
    );
    expect(text).toContain(
      `test split: ${String(hybrid.n)} category names that have a suitable icon`,
    );
    // Every Hit@k / MRR figure in the README is one of those checked above.
    expect(text.match(/(?:Hit@\d|MRR) \d\.\d+/g)).toHaveLength(3);
  });
});
