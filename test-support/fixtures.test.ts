import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { fixturePath } from "./fixtures.js";

it("resolves paths inside the committed fixtures directory", () => {
  expect(existsSync(fixturePath("README.md"))).toBe(true);
});
