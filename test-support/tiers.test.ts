import { expect, it } from "vitest";
import { isSlowTier, SLOW_TESTS_ENV } from "./tiers.js";

it("enables the slow tier only for ICONMATCH_SLOW_TESTS=1", () => {
  expect(SLOW_TESTS_ENV).toBe("ICONMATCH_SLOW_TESTS");
  expect(isSlowTier({})).toBe(false);
  expect(isSlowTier({ ICONMATCH_SLOW_TESTS: "0" })).toBe(false);
  expect(isSlowTier({ ICONMATCH_SLOW_TESTS: "true" })).toBe(false);
  expect(isSlowTier({ ICONMATCH_SLOW_TESTS: "1" })).toBe(true);
});
