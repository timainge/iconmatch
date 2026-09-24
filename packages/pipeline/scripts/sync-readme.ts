// Fills README example blocks from examples/readme/*.ts. Run: npm run readme
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { syncReadme } from "../../../test-support/readme.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const file = `${root}packages/core/README.md`;
await writeFile(file, await syncReadme(await readFile(file, "utf8"), root));
console.log(`synced ${file}`);
