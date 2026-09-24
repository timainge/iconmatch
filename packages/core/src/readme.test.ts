import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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

  it("cites no eval numbers while they're provisional", async () => {
    expect(await readme()).not.toMatch(/Hit@\d|MRR/);
  });
});
