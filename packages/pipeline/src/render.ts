import { Resvg } from "@resvg/resvg-js";
import { renderSvg, type SvgBody, type VariantName } from "@iconmatch/core";

/** Vision input size (spec §6.3). */
export const RENDER_SIZE = 256;

/**
 * Renders an icon to a PNG: black strokes on white, 256×256. The stroke keeps
 * its viewBox width (Tabler: 2 of 24 units), so it scales with the image.
 */
export function renderPng(
  svg: SvgBody,
  variant: VariantName = "outline",
  size = RENDER_SIZE,
): Buffer {
  const markup = renderSvg(svg, { variant, size }).replace(
    /currentColor/g,
    "#000000",
  );
  return new Resvg(markup, {
    fitTo: { mode: "width", value: size },
    background: "#ffffff",
  })
    .render()
    .asPng();
}
