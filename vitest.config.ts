import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
import { isSlowTier } from "./test-support/tiers.js";

// Two tiers (spec §10): the default tier is offline and fast; the slow tier
// (ICONMATCH_SLOW_TESTS=1) may download the real model and run the pipeline.
const slow = isSlowTier(process.env);

// "source" resolves workspace packages to their TypeScript sources in dev
// (their package.json exports map it to src/, and to dist/ for consumers).
const conditions = ["source", ...defaultServerConditions];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "build/**", "**/cache/**"],
    testTimeout: slow ? 600_000 : 5_000,
    hookTimeout: slow ? 600_000 : 10_000,
  },
});
