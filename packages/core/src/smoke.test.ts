import { beforeAll, expect, it } from "vitest";
import { loadTabler200 } from "../../../test-support/tabler-200.js";
import { createIconMatcher, type IconMatcher } from "./matcher.js";
import { svgsFromArtifact } from "./svg.js";

// §11.1 M1 smoke set: keyword search gives a plausible top 3, asserted
// against the committed 200-icon fixture catalog.
let matcher: IconMatcher;
beforeAll(async () => {
  const { catalog, keywordIndex, svgs } = await loadTabler200();
  matcher = await createIconMatcher({
    catalog,
    keywordIndex,
    svgs: svgsFromArtifact(svgs),
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

it("best() falls back to a real lettered glyph from the fixture", async () => {
  const best = await matcher.best("Xylophone");
  expect(best).toMatchObject({
    id: "tabler:square-letter-x",
    isFallback: true,
    fallbackLetter: "x",
  });
  expect(await matcher.svg(best.id)).toMatch(/^<svg /);
});
