/**
 * Validation and style lint for generated icons (spec §15.7). A candidate is
 * accepted only if it is a small set of whitelisted stroke elements inside the
 * 24×24 grid; it is then normalised to the shared Tabler/Lucide stroke style
 * (2px, round caps and joins, no fill, `currentColor`), so a model can't
 * smuggle in fills, text, images, scripts or transforms.
 */
import { Resvg } from "@resvg/resvg-js";

/** Elements a generated icon may use. */
export const ALLOWED_ELEMENTS = [
  "path",
  "line",
  "circle",
  "rect",
  "polyline",
  "ellipse",
] as const;
type Element = (typeof ALLOWED_ELEMENTS)[number];

/** Geometry attributes kept per element; presentation attributes are dropped. */
const GEOMETRY: Record<Element, readonly string[]> = {
  path: ["d"],
  line: ["x1", "y1", "x2", "y2"],
  circle: ["cx", "cy", "r"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  polyline: ["points"],
  ellipse: ["cx", "cy", "rx", "ry"],
};

/** Presentation attributes tolerated on input (then replaced by the shared style). */
const PRESENTATION = new Set([
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
]);

export const STYLE_GROUP =
  '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">';

export interface LintLimits {
  /** Most elements. Default 16. */
  maxElements: number;
  /** Most path commands across all paths. Default 120. */
  maxPathCommands: number;
  /** How far outside 0..24 a coordinate may go. Default 1 (strokes are 2 wide). */
  margin: number;
}

export const DEFAULT_LIMITS: LintLimits = {
  maxElements: 16,
  maxPathCommands: 120,
  margin: 1,
};

export type ValidationResult =
  | { ok: true; body: string; elements: number; inkRatio: number }
  | { ok: false; problems: string[] };

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Every coordinate a path visits, including control points, in absolute terms. */
export function pathPoints(d: string): {
  points: [number, number][];
  commands: number;
  problems: string[];
} {
  const tokens =
    d.match(
      /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g,
    ) ?? [];
  const points: [number, number][] = [];
  const problems: string[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  let commands = 0;
  const arity: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
    z: 0,
  };
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i] ?? "";
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      commands++;
      if (cmd === "z" || cmd === "Z") {
        x = sx;
        y = sy;
      }
      continue;
    }
    const lower = cmd.toLowerCase();
    const n = arity[lower];
    if (n === undefined || n === 0) {
      problems.push(`path has a number with no command: "${d.slice(0, 40)}"`);
      break;
    }
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some((a) => !Number.isFinite(a))) {
      problems.push(`path command ${cmd} has too few numbers`);
      break;
    }
    i += n;
    const rel = cmd === lower;
    const ax = (v: number) => (rel ? x + v : v);
    const ay = (v: number) => (rel ? y + v : v);
    const [a0 = 0, a1 = 0, a2 = 0, a3 = 0, , a5 = 0, a6 = 0] = args;
    switch (lower) {
      case "m":
      case "l":
      case "t":
        x = ax(a0);
        y = ay(a1);
        if (lower === "m") {
          sx = x;
          sy = y;
          cmd = rel ? "l" : "L"; // implicit lineto after moveto
        }
        points.push([x, y]);
        break;
      case "h":
        x = ax(a0);
        points.push([x, y]);
        break;
      case "v":
        y = ay(a0);
        points.push([x, y]);
        break;
      case "c":
        points.push([ax(a0), ay(a1)], [ax(a2), ay(a3)]);
        x = ax(args[4] ?? 0);
        y = ay(a5);
        points.push([x, y]);
        break;
      case "s":
      case "q":
        points.push([ax(a0), ay(a1)]);
        x = ax(a2);
        y = ay(a3);
        points.push([x, y]);
        break;
      case "a": {
        const ex = ax(a5);
        const ey = ay(a6);
        points.push(...arcPoints(x, y, args, ex, ey), [ex, ey]);
        x = ex;
        y = ey;
        break;
      }
    }
    commands++;
  }
  return { points, commands, problems };
}

/**
 * Points along an elliptical arc from (x1,y1) to (x2,y2), via the SVG spec's
 * endpoint-to-centre conversion (SVG 1.1 appendix F.6.5), sampled every 1/16
 * of the sweep, so bounds checks see the curve, not just its endpoints.
 */
export function arcPoints(
  x1: number,
  y1: number,
  args: readonly number[],
  x2: number,
  y2: number,
): [number, number][] {
  let rx = Math.abs(args[0] ?? 0);
  let ry = Math.abs(args[1] ?? 0);
  const phi = ((args[2] ?? 0) * Math.PI) / 180;
  const largeArc = (args[3] ?? 0) !== 0;
  const sweep = (args[4] ?? 0) !== 0;
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [];
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  // Scale the radii up if they can't span the endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef =
    (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const out: [number, number][] = [];
  for (let k = 1; k < 16; k++) {
    const t = theta1 + (delta * k) / 16;
    out.push([
      cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
      cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
    ]);
  }
  return out;
}

function attributes(tag: string): Map<string, string> | string {
  const out = new Map<string, string>();
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let rest = tag;
  for (const m of tag.matchAll(re)) {
    out.set(m[1] ?? "", m[3] ?? m[4] ?? "");
    rest = rest.replace(m[0], "");
  }
  return rest.trim() === "" ? out : `unparsable attributes: ${rest.trim()}`;
}

/**
 * Validates a candidate (a full `<svg>` or just its inner elements) and
 * returns the normalised body on success.
 */
export function validateIcon(
  svg: string,
  limits: LintLimits = DEFAULT_LIMITS,
): ValidationResult {
  const problems: string[] = [];
  let inner = svg.trim();
  const outer = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i.exec(inner);
  if (outer) {
    const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(outer[1] ?? "")?.[1];
    if (
      viewBox &&
      viewBox
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .join(" ") !== "0 0 24 24"
    )
      problems.push(`viewBox must be 0 0 24 24, got "${viewBox}"`);
    inner = outer[2] ?? "";
  }
  // Unwrap one <g> that only carries presentation attributes.
  const group = /^\s*<g\b([^>]*)>([\s\S]*)<\/g>\s*$/.exec(inner);
  if (group) {
    const attrs = attributes(group[1] ?? "");
    if (typeof attrs === "string") problems.push(`<g>: ${attrs}`);
    else
      for (const k of attrs.keys())
        if (!PRESENTATION.has(k)) problems.push(`<g> has attribute ${k}`);
    inner = group[2] ?? "";
  }
  if (/<!--|<!\[CDATA\[|<\?/.test(inner))
    problems.push("comments, CDATA or processing instructions are not allowed");

  const elements: string[] = [];
  const points: [number, number][] = [];
  let pathCommands = 0;
  // Greedy [^>]* can't backtrack: linear even for long path data.
  const tagRe = /<\s*([A-Za-z][\w-]*)([^>]*)>/g;
  let last = 0;
  for (const m of inner.matchAll(tagRe)) {
    const between = inner.slice(last, m.index).trim();
    if (between && !/^<\/[a-z]+>$/i.test(between))
      problems.push(
        `text or stray markup is not allowed: "${between.slice(0, 30)}"`,
      );
    last = m.index + m[0].length;
    const name = (m[1] ?? "").toLowerCase();
    if (!(ALLOWED_ELEMENTS as readonly string[]).includes(name)) {
      problems.push(`element <${name}> is not allowed`);
      continue;
    }
    const el = name as Element;
    const attrs = attributes((m[2] ?? "").replace(/\/\s*$/, ""));
    if (typeof attrs === "string") {
      problems.push(`<${el}>: ${attrs}`);
      continue;
    }
    const kept: string[] = [];
    for (const [k, v] of attrs) {
      if (GEOMETRY[el].includes(k)) {
        kept.push(`${k}="${v}"`);
        continue;
      }
      if (!PRESENTATION.has(k)) {
        problems.push(`<${el}> has attribute ${k}`);
        continue;
      }
      if (k === "fill" && v !== "none")
        problems.push(`<${el}> is filled (fill="${v}"); icons are stroke-only`);
    }
    const num = (k: string) => Number(attrs.get(k) ?? "0");
    switch (el) {
      case "path": {
        const p = pathPoints(attrs.get("d") ?? "");
        problems.push(...p.problems);
        points.push(...p.points);
        pathCommands += p.commands;
        if (p.points.length === 0)
          problems.push("<path> has no drawing commands");
        break;
      }
      case "line":
        points.push([num("x1"), num("y1")], [num("x2"), num("y2")]);
        break;
      case "circle":
        points.push(
          [num("cx") - num("r"), num("cy") - num("r")],
          [num("cx") + num("r"), num("cy") + num("r")],
        );
        break;
      case "ellipse":
        points.push(
          [num("cx") - num("rx"), num("cy") - num("ry")],
          [num("cx") + num("rx"), num("cy") + num("ry")],
        );
        break;
      case "rect":
        points.push(
          [num("x"), num("y")],
          [num("x") + num("width"), num("y") + num("height")],
        );
        break;
      case "polyline": {
        const ns = (attrs.get("points") ?? "").match(NUM)?.map(Number) ?? [];
        if (ns.length < 4 || ns.length % 2 !== 0)
          problems.push("<polyline> needs an even number of coordinates");
        for (let i = 0; i + 1 < ns.length; i += 2)
          points.push([ns[i] ?? 0, ns[i + 1] ?? 0]);
        break;
      }
    }
    elements.push(`<${el} ${kept.join(" ")}/>`);
  }
  const trailing = inner
    .slice(last)
    .replace(/<\/[a-z]+>/gi, "")
    .trim();
  if (trailing)
    problems.push(
      `text or stray markup is not allowed: "${trailing.slice(0, 30)}"`,
    );

  if (elements.length === 0) problems.push("no drawing elements");
  if (elements.length > limits.maxElements)
    problems.push(
      `too many elements (${String(elements.length)} > ${String(limits.maxElements)})`,
    );
  if (pathCommands > limits.maxPathCommands)
    problems.push(
      `paths too complex (${String(pathCommands)} commands > ${String(limits.maxPathCommands)})`,
    );
  const lo = -limits.margin;
  const hi = 24 + limits.margin;
  const outside = points.filter(
    ([px, py]) =>
      px < lo ||
      px > hi ||
      py < lo ||
      py > hi ||
      !Number.isFinite(px) ||
      !Number.isFinite(py),
  );
  if (outside.length > 0)
    problems.push(
      `${String(outside.length)} coordinate(s) outside the 24×24 grid, e.g. (${String(outside[0]?.[0])}, ${String(outside[0]?.[1])})`,
    );
  if (problems.length > 0) return { ok: false, problems };

  const body = `${STYLE_GROUP}${elements.join("")}</g>`;
  const inkRatio = ink(body);
  if (inkRatio < 0.01)
    return { ok: false, problems: ["renders almost nothing"] };
  if (inkRatio > 0.6)
    return { ok: false, problems: ["renders as a solid blob"] };
  return { ok: true, body, elements: elements.length, inkRatio };
}

/** Share of dark pixels when rendered black on white at 64×64. */
export function ink(body: string): number {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" style="color:#000">${body.replace(/currentColor/g, "#000")}</svg>`;
  // No text in icons, so skip loading system fonts (slow on every call).
  const img = new Resvg(svg, {
    background: "#ffffff",
    font: { loadSystemFonts: false },
  }).render();
  const px = img.pixels;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) if ((px[i] ?? 255) < 128) dark++;
  return dark / (px.length / 4);
}
