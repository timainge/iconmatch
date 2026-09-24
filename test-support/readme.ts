import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MARKER = /<!-- example: (\S+) -->\n(?:\n```ts\n[\s\S]*?\n```\n)?/g;

/**
 * Fills each `<!-- example: path -->` marker in a README with the file's
 * contents as a ```ts block, replacing any block already there. The example
 * files are type-checked by the root tsconfig, so README code is too.
 */
export async function syncReadme(
  markdown: string,
  repoRoot: string,
): Promise<string> {
  const paths = [...markdown.matchAll(MARKER)].map((m) => m[1] ?? "");
  const bodies = new Map<string, string>();
  for (const p of paths)
    bodies.set(p, (await readFile(join(repoRoot, p), "utf8")).trimEnd());
  return markdown.replace(
    MARKER,
    (_all, p: string) =>
      `<!-- example: ${p} -->\n\n\`\`\`ts\n${bodies.get(p) ?? ""}\n\`\`\`\n`,
  );
}

export function readmeExamplePaths(markdown: string): string[] {
  return [...markdown.matchAll(MARKER)].map((m) => m[1] ?? "");
}
