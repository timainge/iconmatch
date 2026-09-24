import type { SvgArtifact, SvgBody, VariantName } from "./types.js";

/** Supplies SVG bodies on demand (spec §7.0), from the artifact or a server. */
export interface SvgProvider {
  get(id: string, variant: VariantName): Promise<SvgBody>;
}

/** SvgProvider over a loaded `svgs.json`. */
export function svgsFromArtifact(svgs: SvgArtifact): SvgProvider {
  return {
    get(id, variant) {
      const body = svgs[id]?.[variant];
      return body
        ? Promise.resolve(body)
        : Promise.reject(new Error(`No SVG for ${id} (${variant})`));
    },
  };
}

export interface RenderSvgOptions {
  /** Variant the body belongs to; decides fill vs stroke styling. */
  variant: VariantName;
  /** Height in px; width follows the viewBox aspect ratio. Default 24. */
  size?: number;
  /** Stroke width for stroked variants only. Default: the body's own (Tabler: 2). */
  strokeWidth?: number;
  /** Accessible name: switches to `role="img"` with a `<title>`. */
  title?: string;
}

const STROKED: ReadonlySet<VariantName> = new Set([
  "outline",
  "thin",
  "light",
  "bold",
  "duotone",
]);

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Renders a complete `<svg>` string (spec §7.6). Pure; works in any runtime. */
export function renderSvg(svg: SvgBody, options: RenderSvgOptions): string {
  const size = options.size ?? 24;
  const stroked = STROKED.has(options.variant);
  let body = svg.body;
  const attrs: [string, string][] = [
    ["xmlns", "http://www.w3.org/2000/svg"],
    ["width", num((size * svg.width) / svg.height)],
    ["height", num(size)],
    ["viewBox", `0 0 ${num(svg.width)} ${num(svg.height)}`],
  ];
  if (stroked) {
    attrs.push(["fill", "none"], ["stroke", "currentColor"]);
    if (options.strokeWidth !== undefined) {
      const w = num(options.strokeWidth);
      attrs.push(["stroke-width", w]);
      // Bodies carry stroke-width inline, which would override the root.
      body = body.replace(/stroke-width="[^"]*"/g, `stroke-width="${w}"`);
    }
    attrs.push(["stroke-linecap", "round"], ["stroke-linejoin", "round"]);
  } else {
    attrs.push(["fill", "currentColor"]);
  }
  let title = "";
  if (options.title !== undefined) {
    attrs.push(["role", "img"]);
    title = `<title>${escapeXml(options.title)}</title>`;
  } else {
    attrs.push(["aria-hidden", "true"]);
  }
  const open = attrs.map(([k, v]) => `${k}="${escapeXml(v)}"`).join(" ");
  return `<svg ${open}>${title}${body}</svg>`;
}
