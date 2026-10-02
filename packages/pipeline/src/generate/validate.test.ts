import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fixturePath } from "../../../../test-support/fixtures.js";
import {
  arcPoints,
  pathPoints,
  STYLE_GROUP,
  validateIcon,
} from "./validate.js";

const svg = (inner: string, viewBox = "0 0 24 24") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2">${inner}</svg>`;

describe("validateIcon (spec §15.7)", () => {
  it("accepts whitelisted stroke elements and normalises them to the shared style", () => {
    const r = validateIcon(
      svg(
        '<path d="M4 20l8-16l8 16" stroke-linecap="square"/><circle cx="12" cy="14" r="2" fill="none"/><line x1="7" y1="16" x2="17" y2="16"/>',
      ),
    );
    expect(r).toMatchObject({ ok: true, elements: 3 });
    if (r.ok)
      expect(r.body).toBe(
        `${STYLE_GROUP}<path d="M4 20l8-16l8 16"/><circle cx="12" cy="14" r="2"/><line x1="7" y1="16" x2="17" y2="16"/></g>`,
      );
  });

  it("accepts a bare body and a presentation-only <g> wrapper (as Iconify ships icons)", () => {
    expect(
      validateIcon(
        '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></g>',
      ).ok,
    ).toBe(true);
  });

  it.each([
    [
      "text",
      svg('<text x="4" y="12">Hi</text>'),
      /element <text> is not allowed/,
    ],
    [
      "images",
      svg('<image href="x.png" width="24" height="24"/>'),
      /element <image>/,
    ],
    ["scripts", svg("<script>alert(1)</script>"), /element <script>/],
    ["fills", svg('<circle cx="12" cy="12" r="6" fill="#000"/>'), /is filled/],
    [
      "transforms",
      svg('<path d="M4 4h16" transform="rotate(45)"/>'),
      /attribute transform/,
    ],
    [
      "event handlers",
      svg('<path d="M4 4h16" onload="x()"/>'),
      /attribute onload/,
    ],
    [
      "other viewBoxes",
      svg('<path d="M4 4h16"/>', "0 0 32 32"),
      /viewBox must be 0 0 24 24/,
    ],
    [
      "points outside the grid",
      svg('<line x1="2" y1="2" x2="40" y2="12"/>'),
      /outside the 24×24 grid/,
    ],
    [
      "control points outside the grid",
      svg('<path d="M4 12C4 -20 20 -20 20 12"/>'),
      /outside the 24×24 grid/,
    ],
    ["stray text", svg('hello<path d="M4 4h16"/>'), /text or stray markup/],
    ["no elements", svg(""), /no drawing elements/],
    ["comments", svg('<!-- x --><path d="M4 4h16"/>'), /comments/],
  ])("rejects %s", (_label, input, problem) => {
    const r = validateIcon(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("; ")).toMatch(problem);
  });

  it("enforces the complexity limits and rejects blobs and near-empty drawings", () => {
    const many = Array.from(
      { length: 17 },
      (_, i) => `<line x1="${String(i)}" y1="4" x2="${String(i)}" y2="20"/>`,
    ).join("");
    expect(validateIcon(svg(many))).toMatchObject({ ok: false });
    const blob = Array.from(
      { length: 12 },
      (_, i) =>
        `<line x1="0" y1="${String(i * 2 + 1)}" x2="24" y2="${String(i * 2 + 1)}"/>`,
    ).join("");
    const b = validateIcon(svg(blob));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.problems).toEqual(["renders as a solid blob"]);
    const dot = validateIcon(svg('<path d="M12 12h0.01"/>'));
    expect(dot.ok).toBe(false);
  });
});

describe("validateIcon on real icons in the target style", () => {
  it("accepts at least 99% of the Tabler fixture icons (the rest have filled details)", async () => {
    const svgs = JSON.parse(
      await readFile(fixturePath("tabler-200", "svgs.json"), "utf8"),
    ) as Record<string, { outline?: { body: string } }>;
    const results = Object.entries(svgs).map(([id, v]) => ({
      id,
      r: validateIcon(v.outline?.body ?? ""),
    }));
    const failed = results.filter((x) => !x.r.ok);
    expect(failed.length / results.length).toBeLessThanOrEqual(0.01);
    for (const f of failed)
      if (!f.r.ok) expect(f.r.problems.join(" ")).toMatch(/is filled/);
  });
});

describe("arcPoints", () => {
  it("follows the curve: a half circle from (3,12) to (21,12) bulges to y = 3, not past the grid", () => {
    const pts = arcPoints(3, 12, [9, 9, 0, 1, 1], 21, 12);
    const ys = pts.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(3, 0);
    expect(Math.max(...pts.map(([x]) => x))).toBeLessThanOrEqual(21.001);
  });
});

describe("validateIcon performance", () => {
  it("stays fast on long path data (no regex backtracking)", () => {
    const d = "M4 4" + "l0.01 0.01".repeat(2000);
    const t = performance.now();
    validateIcon(`<path d="${d}"/>`, {
      maxElements: 16,
      maxPathCommands: 5000,
      margin: 1,
    });
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("pathPoints", () => {
  it("tracks absolute and relative commands, curve control points and implicit linetos", () => {
    const p = pathPoints("M2 2l2 0 0 2h2v2C10 10 12 10 12 12s2 2 4 4z");
    expect(p.problems).toEqual([]);
    expect(p.points).toEqual([
      [2, 2],
      [4, 2],
      [4, 4],
      [6, 4],
      [6, 6],
      [10, 10],
      [12, 10],
      [12, 12],
      [14, 14],
      [16, 16],
    ]);
  });

  it("reports malformed paths", () => {
    expect(pathPoints("4 4").problems).toEqual([
      'path has a number with no command: "4 4"',
    ]);
    expect(pathPoints("M4").problems).toEqual([
      "path command M has too few numbers",
    ]);
  });
});
