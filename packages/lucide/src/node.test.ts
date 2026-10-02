import { existsSync } from "node:fs";
import { loadCatalog, loadManifest } from "@iconmatch/core";
import { describe, expect, it } from "vitest";
import { LUCIDE_DATA_DIR, lucideSource } from "./node.js";

describe("@iconmatch/lucide/node", () => {
  it("points at the package's own data directory", () => {
    expect(LUCIDE_DATA_DIR).toMatch(/packages[\\/]lucide[\\/]data[\\/]$/);
  });

  // The data is built (`iconmatch-build all --config iconmatch.lucide.config.ts`),
  // not committed; check it whenever it's present.
  it.runIf(existsSync(`${LUCIDE_DATA_DIR}manifest.json`))(
    "reads a Lucide manifest and catalog with fallback glyphs",
    async () => {
      const source = lucideSource();
      const manifest = await loadManifest(source);
      expect(manifest.sets).toMatchObject([
        { id: "lucide", license: "ISC", fallbackIcon: "lucide:shapes" },
      ]);
      const ids = new Set(
        (await loadCatalog(source, { manifest })).map((e) => e.id),
      );
      expect(ids.has("lucide:dog")).toBe(true);
      expect(ids.has("lucide:square-letter-a")).toBe(true);
    },
  );
});
