import { beforeAll, expect, it } from "vitest";
import {
  createIconMatcher,
  parseKeywordIndex,
  type IconMatcher,
} from "iconmatch";
import { createTablerAdapter } from "./adapters/tabler.js";
import { ingest } from "./ingest.js";
import { keywordIndexJson } from "./index.js";

// §11.1 M1 smoke set: keyword search gives a plausible top 3 on the real Tabler catalog.
let matcher: IconMatcher;
beforeAll(async () => {
  const { catalog } = await ingest([
    createTablerAdapter({ log: () => undefined }),
  ]);
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
