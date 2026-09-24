// Regenerates fixtures/tabler-200 from the installed Tabler packages.
// Run: npm run fixtures
import { fileURLToPath } from "node:url";
import { createTablerAdapter } from "../src/adapters/tabler.js";
import { selectFixture, writeFixture } from "../src/fixtures.js";
import { ingest } from "../src/ingest.js";

const dir = fileURLToPath(
  new URL("../../../fixtures/tabler-200/", import.meta.url),
);
const fixture = selectFixture(await ingest([createTablerAdapter()]));
await writeFixture(fixture, dir);
console.log(`wrote ${String(fixture.catalog.length)} icons to ${dir}`);
