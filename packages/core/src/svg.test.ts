import { describe, expect, it } from "vitest";
import { IconMatchCapabilityError } from "./errors.js";
import { createIconMatcher } from "./matcher.js";
import { renderSvg, svgsFromArtifact } from "./svg.js";
import type { CatalogEntry, SvgArtifact, SvgBody } from "./types.js";

// Real bodies from @iconify-json/tabler 1.2.40 (Tabler 3.48.0).
const HEART =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 12.572L12 20l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572"/>';
const CALENDAR =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm12-4v4M8 3v4m-4 4h16m-9 4h1m0 0v3"/>';
const NETFLIX =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 3l10 18h-4L5 3zM5 3v18h4V10.5M19 21V3h-4v10.5"/>';
const HEART_FILLED =
  '<path fill="currentColor" d="M6.979 3.074a6 6 0 0 1 4.988 1.425l.037.033l.034-.03a6 6 0 0 1 4.733-1.44l.246.036a6 6 0 0 1 3.364 10.008l-.18.185l-.048.041l-7.45 7.379a1 1 0 0 1-1.313.082l-.094-.082l-7.493-7.422A6 6 0 0 1 6.979 3.074"/>';
const SQUARE_LETTER_A =
  '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 16v-6a2 2 0 1 1 4 0v6m-4-3h4"/></g>';

const box = (body: string): SvgBody => ({ body, width: 24, height: 24 });

const svgs: SvgArtifact = {
  "tabler:heart": { outline: box(HEART), filled: box(HEART_FILLED) },
  "tabler:calendar": { outline: box(CALENDAR) },
  "tabler:brand-netflix": { outline: box(NETFLIX) },
  "tabler:square-letter-a": { outline: box(SQUARE_LETTER_A) },
};

function entry(name: string, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: `tabler:${name}`,
    set: "tabler",
    name,
    label: name,
    tags: [],
    categories: [],
    variants: ["outline"],
    license: "MIT",
    ...extra,
  };
}

const catalog = [
  entry("heart", { variants: ["outline", "filled"] }),
  entry("calendar"),
  entry("brand-netflix", { brand: true }),
  entry("square-letter-a", { glyph: "letter" }),
];

describe("renderSvg", () => {
  it("renders a complete svg with viewBox, size and currentColor stroke for outline", () => {
    const out = renderSvg(box(HEART), { variant: "outline", size: 32 });
    expect(out).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" /);
    expect(out).toContain('width="32" height="32" viewBox="0 0 24 24"');
    expect(out).toContain('fill="none" stroke="currentColor"');
    expect(out.endsWith("</svg>")).toBe(true);
  });

  it("defaults to 24px and aria-hidden", () => {
    const out = renderSvg(box(HEART), { variant: "outline" });
    expect(out).toContain('width="24" height="24"');
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain("role=");
  });

  it("applies strokeWidth to outline, including inline stroke-width in the body", () => {
    const out = renderSvg(box(CALENDAR), {
      variant: "outline",
      strokeWidth: 1.5,
    });
    expect(out.match(/stroke-width="1.5"/g)).toHaveLength(2);
    expect(out).not.toContain('stroke-width="2"');
  });

  it("does not apply strokeWidth to filled variants", () => {
    const out = renderSvg(box(HEART_FILLED), {
      variant: "filled",
      strokeWidth: 1.5,
    });
    expect(out).toContain('fill="currentColor"');
    expect(out).not.toContain("stroke");
  });

  it("switches to role=img with an escaped title", () => {
    const out = renderSvg(box(HEART), {
      variant: "outline",
      title: 'Love & "likes" <3',
    });
    expect(out).toContain('role="img"');
    expect(out).not.toContain("aria-hidden");
    expect(out).toContain("<title>Love &amp; &quot;likes&quot; &lt;3</title>");
  });

  it("keeps the viewBox aspect ratio for non-square icons", () => {
    const out = renderSvg(
      { body: "", width: 48, height: 24 },
      { variant: "outline", size: 16 },
    );
    expect(out).toContain('width="32" height="16" viewBox="0 0 48 24"');
  });
});

describe("matcher.svg()", () => {
  const parts = { catalog, svgs: svgsFromArtifact(svgs) };

  it("throws IconMatchCapabilityError without the svgs part", async () => {
    const m = await createIconMatcher({ catalog });
    await expect(m.svg("tabler:heart")).rejects.toMatchObject({
      constructor: IconMatchCapabilityError,
      method: "svg",
      part: "svgs",
    });
  });

  it("rejects unknown ids", async () => {
    const m = await createIconMatcher(parts);
    await expect(m.svg("tabler:nope")).rejects.toThrow(
      "Unknown icon id: tabler:nope",
    );
  });

  it("renders the requested variant when available", async () => {
    const m = await createIconMatcher(parts);
    expect(await m.svg("tabler:heart", { variant: "filled" })).toContain(
      HEART_FILLED,
    );
  });

  describe("snapshots (spec §10)", () => {
    it.each(["tabler:heart", "tabler:calendar", "tabler:brand-netflix"])(
      "%s",
      async (id) => {
        const m = await createIconMatcher(parts);
        expect(await m.svg(id)).toMatchSnapshot("default");
        expect(
          await m.svg(id, { size: 32, strokeWidth: 1.5, title: "An icon" }),
        ).toMatchSnapshot("with title, size and strokeWidth");
      },
    );

    it("requested filled variant falls back to outline", async () => {
      const m = await createIconMatcher(parts);
      const out = await m.svg("tabler:calendar", { variant: "filled" });
      expect(out).toBe(await m.svg("tabler:calendar"));
      expect(out).toMatchSnapshot();
    });
  });
});
