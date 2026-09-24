import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { QUERY_PREFIX } from "./embedding.js";

const repo = fileURLToPath(new URL("../../../", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    // Generated output (node_modules, dist) isn't source.
    if (d.isDirectory())
      return d.name === "node_modules" || d.name === "dist"
        ? []
        : sourceFiles(p);
    return /\.ts$/.test(d.name) && !/\.test\.ts$/.test(d.name) ? [p] : [];
  });
}

// Spec §6.4 / §11.1 M2: the query prefix is defined once, in shared code.
it("the bge query prefix literal lives only in packages/core/src/embedding.ts", () => {
  const needle = "Represent this sentence for searching";
  const hits = ["packages", "eval", "examples"]
    .flatMap((d) => {
      try {
        return sourceFiles(join(repo, d));
      } catch {
        return [];
      }
    })
    .filter((f) => readFileSync(f, "utf8").includes(needle))
    .map((f) => relative(repo, f));
  expect(hits).toEqual(["packages/core/src/embedding.ts"]);
  expect(QUERY_PREFIX.startsWith(needle)).toBe(true);
});

it("the runtime embedder takes query text from the shared module", () => {
  const src = readFileSync(
    join(repo, "packages/core/src/embedders/transformers.ts"),
    "utf8",
  );
  expect(src).toMatch(/from "\.\.\/embedding\.js"/);
  expect(src).toContain("embeddingInput(");
});

it("the build embeds through the shared embedder module", () => {
  const cli = readFileSync(join(repo, "packages/pipeline/src/cli.ts"), "utf8");
  expect(cli).toMatch(/from "iconmatch\/embedder-transformers"/);
  const embed = readFileSync(
    join(repo, "packages/pipeline/src/embed.ts"),
    "utf8",
  );
  expect(embed).toContain('"document"');
});
