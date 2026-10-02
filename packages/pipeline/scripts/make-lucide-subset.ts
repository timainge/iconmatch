// Regenerates fixtures/lucide-subset.json: the icon names the Lucide CI build
// keeps (every 20th visible icon plus every fallback glyph and the neutral
// glyph). Run: npx tsx --conditions=source packages/pipeline/scripts/make-lucide-subset.ts
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { lucideIcons, readLucideSource } from "../src/adapters/lucide.js";

const { icons } = lucideIcons(await readLucideSource());
const names = icons
  .filter(
    (i, n) => i.glyph !== undefined || i.name === "shapes" || n % 20 === 0,
  )
  .map((i) => i.name);
const file = fileURLToPath(
  new URL("../../../fixtures/lucide-subset.json", import.meta.url),
);
await writeFile(file, JSON.stringify(names, null, 2) + "\n");
console.log(`wrote ${String(names.length)} names to ${file}`);
