import { beforeAll, describe, expect, it } from "vitest";
import { loadTabler200 } from "../../../test-support/tabler-200.js";
import { createIconMatcher, type IconMatcher } from "./matcher.js";
import { renderSvg, svgsFromArtifact } from "./svg.js";
import type { CatalogEntry, IconMatch, SvgArtifact } from "./types.js";

// Spec §7.0 rule 4: wire types are JSON-safe, so a server can send search
// results and SVG bodies that a browser renders with the same `renderSvg`.
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("wire types survive a JSON round-trip", () => {
  let catalog: CatalogEntry[];
  let svgs: SvgArtifact;
  let matcher: IconMatcher;
  beforeAll(async () => {
    const fixture = await loadTabler200();
    ({ catalog, svgs } = fixture);
    matcher = await createIconMatcher({
      ...fixture,
      svgs: svgsFromArtifact(svgs),
    });
  });

  it("IconMatch from search() and best(), including a fallback", async () => {
    const results: IconMatch[] = [
      ...(await matcher.search("dog grooming", { limit: 20 })),
      await matcher.best("Calendar"),
      await matcher.best("Xylophone"),
      await matcher.best("???"),
    ];
    expect(
      results.some((r) => r.isFallback === true && r.fallbackLetter === "x"),
    ).toBe(true);
    expect(roundTrip(results)).toStrictEqual(results);
  });

  it("CatalogEntry, including brand and glyph entries", () => {
    const sample = catalog.filter(
      (e) => e.brand || e.glyph || e.name === "heart",
    );
    expect(sample.some((e) => e.brand) && sample.some((e) => e.glyph)).toBe(
      true,
    );
    expect(roundTrip(sample)).toStrictEqual(sample);
  });

  it("SvgBody renders identically after a round-trip", () => {
    const body = svgs["tabler:brand-netflix"]?.outline;
    if (!body) throw new Error("fixture lacks tabler:brand-netflix");
    const opts = {
      variant: "outline" as const,
      size: 32,
      strokeWidth: 1.5,
      title: "Netflix",
    };
    expect(roundTrip(body)).toStrictEqual(body);
    expect(renderSvg(roundTrip(body), opts)).toBe(renderSvg(body, opts));
  });
});
