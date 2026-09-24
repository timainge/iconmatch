import { expect, it } from "vitest";
import { SCHEMA_VERSION } from "./index.js";

it("exposes the manifest schema version", () => {
  expect(SCHEMA_VERSION).toBe(1);
});
