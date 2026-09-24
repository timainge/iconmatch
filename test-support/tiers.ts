import { describe, it } from "vitest";

/** Env var that enables the slow test tier (spec §10). */
export const SLOW_TESTS_ENV = "ICONMATCH_SLOW_TESTS";

/** True when the slow tier is enabled. Only the exact value "1" counts. */
export function isSlowTier(env: Record<string, string | undefined>): boolean {
  return env[SLOW_TESTS_ENV] === "1";
}

const slow = isSlowTier(process.env);

/**
 * Slow-tier tests: real embedding model, full pipeline, possibly network.
 * Skipped in the default tier so `npm run check` stays offline and fast.
 */
export const describeSlow = describe.runIf(slow);
export const itSlow = it.runIf(slow);
