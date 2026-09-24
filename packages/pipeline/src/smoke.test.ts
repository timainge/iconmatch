import { beforeAll, expect, it } from "vitest";
import {
  createIconMatcher,
  letterFallback,
  parseKeywordIndex,
  type CatalogEntry,
  type IconMatcher,
} from "iconmatch";
import { createTablerAdapter } from "./adapters/tabler.js";
import { ingest } from "./ingest.js";
import { keywordIndexJson } from "./index.js";

// §11.1 M1 smoke set: keyword search gives a plausible top 3 on the real Tabler catalog.
let matcher: IconMatcher;
let catalog: CatalogEntry[];
beforeAll(async () => {
  ({ catalog } = await ingest([createTablerAdapter({ log: () => undefined })]));
  matcher = await createIconMatcher({
    catalog,
    keywordIndex: parseKeywordIndex(keywordIndexJson(catalog)),
  });
});

it.each([
  ["dog", /^tabler:(dog|paw)/],
  ["heart", /heart/],
  ["money", /money|cash|coin|currency/],
  ["car", /^tabler:car/],
  ["calendar", /^tabler:calendar/],
])("%s has a plausible top 3", async (query, plausible) => {
  const top3 = (await matcher.search(query, { limit: 3 })).map((r) => r.id);
  expect(top3).toHaveLength(3);
  expect(top3.every((id) => plausible.test(id))).toBe(true);
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
