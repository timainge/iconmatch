import { beforeAll, expect, it } from "vitest";
import { letterFallback, type CatalogEntry } from "iconmatch";
import { createTablerAdapter } from "./adapters/tabler.js";
import { ingest } from "./ingest.js";

let catalog: CatalogEntry[];
beforeAll(async () => {
  ({ catalog } = await ingest([createTablerAdapter({ log: () => undefined })]));
});

// §11.1 M1: the lettered fallback resolves to real glyph ids for a–z and 0–9.
it.each(["square", "circle"] as const)(
  "%s fallback glyphs exist for a–z and 0–9",
  (shape) => {
    for (const c of "abcdefghijklmnopqrstuvwxyz0123456789") {
      const m = letterFallback(`${c.toUpperCase()} label`, catalog, {
        fallbackShape: shape,
      });
      const kind = /[0-9]/.test(c) ? "number" : "letter";
      expect(m).toMatchObject({
        id: `tabler:${shape}-${kind}-${c}`,
        fallbackLetter: c,
      });
      expect(catalog.find((e) => e.id === m.id)?.glyph).toBe(kind);
    }
    expect(letterFallback("!!!", catalog).id).toBe("tabler:category");
  },
);
