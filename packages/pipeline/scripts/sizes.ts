// `npm run sizes`: per-composition artifact sizes (spec §11.1 M5) and the npm pack check.
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkPackFiles,
  compositionSizes,
  CORE_PACK,
  formatCompositionSizes,
  LUCIDE_PACK,
  packFiles,
} from "../src/pack-check.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const modelDir = join(
  process.env.ICONMATCH_MODEL_CACHE ??
    join(homedir(), ".cache", "iconmatch", "models"),
  "Xenova",
  "bge-small-en-v1.5",
);
for (const [spec, dataDir] of [
  [CORE_PACK, "packages/core/data"],
  [LUCIDE_PACK, "packages/lucide/data"],
] as const) {
  console.log(`\n## ${spec.workspace}\n`);
  console.log(
    formatCompositionSizes(
      await compositionSizes(join(root, dataDir), modelDir),
    ),
  );
  const pack = await packFiles(root, spec.workspace);
  const problems = checkPackFiles(pack.paths, spec);
  console.log(
    `\nnpm pack: ${String(pack.paths.length)} files, ${(pack.size / 1e6).toFixed(2)} MB packed, ${(pack.unpackedSize / 1e6).toFixed(2)} MB unpacked`,
  );
  console.log(problems.length ? problems.join("\n") : "pack contents ok");
  if (problems.length) process.exitCode = 1;
}
