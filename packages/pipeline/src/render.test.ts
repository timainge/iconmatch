import { Resvg } from "@resvg/resvg-js";
import { expect, it } from "vitest";
import { RENDER_SIZE, renderPng } from "./render.js";

const heart = {
  body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 12.572L12 20l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572"/>',
  width: 24,
  height: 24,
};

it("renders a 256×256 PNG, black line drawing on white", () => {
  const png = renderPng(heart);
  expect([...png.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  expect(png.readUInt32BE(16)).toBe(RENDER_SIZE); // IHDR width
  expect(png.readUInt32BE(20)).toBe(RENDER_SIZE); // IHDR height
  // Re-rasterise the same SVG markup path to inspect pixels: mostly white, some black.
  const pixels = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><image href="data:image/png;base64,${png.toString("base64")}" width="24" height="24"/></svg>`,
    { fitTo: { mode: "width", value: 64 } },
  ).render().pixels;
  let dark = 0;
  let light = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const v = (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0);
    if (v < 150) dark++;
    else if (v > 700) light++;
  }
  expect(dark).toBeGreaterThan(50);
  expect(light).toBeGreaterThan(dark);
});

it("is deterministic", () => {
  expect(renderPng(heart).equals(renderPng(heart))).toBe(true);
});
