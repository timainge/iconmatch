import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, loadManifest } from "iconmatch";
import { fsSource } from "iconmatch/node";
import { expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { main } from "./cli.js";

const repo = fileURLToPath(new URL("../../../", import.meta.url));

// Spec §10 / §11.1 M5: CI builds the 200-icon subset with --enrich none.
it("iconmatch.ci.config.ts builds and packages exactly the 200-icon fixture subset", async () => {
  const build = await mkdtemp(join(tmpdir(), "iconmatch-ci-"));
  const logs: string[] = [];
  try {
    const code = await main(
      [
        "all",
        "--config",
        "iconmatch.ci.config.ts",
        "--mode",
        "none",
        "--build-dir",
        build,
        "--package-dir",
        join(build, "package"),
      ],
      {
        cwd: repo,
        log: (m) => logs.push(m),
        error: (m) => logs.push(`ERR ${m}`),
        createEmbedder: () => createFakeEmbedder({ dims: 8 }),
      },
    );
    expect(code, logs.join("\n")).toBe(0);
    const src = fsSource(join(build, "package"));
    const manifest = await loadManifest(src);
    expect(manifest.enrichment).toEqual({ mode: "none" });
    expect(manifest.sets).toMatchObject([{ id: "tabler", count: 200 }]);
    const fixture = JSON.parse(
      await readFile(join(repo, "fixtures/tabler-200/catalog.json"), "utf8"),
    ) as { id: string }[];
    expect((await loadCatalog(src)).map((e) => e.id)).toEqual(
      fixture.map((e) => e.id),
    );
  } finally {
    await rm(build, { recursive: true, force: true });
  }
});

it("the CI workflow runs check, the subset build and a pack dry-run", async () => {
  const yml = await readFile(join(repo, ".github/workflows/ci.yml"), "utf8");
  expect(yml).toContain("run: npm ci");
  expect(yml).toContain("run: npm run check");
  expect(yml).toContain(
    "npx iconmatch-build all --config iconmatch.ci.config.ts --mode none",
  );
  expect(yml).toContain("npm pack --dry-run -w iconmatch");
  // No Ollama in CI (CLAUDE.md, spec §10): no run step mentions it.
  expect(yml).not.toMatch(/run:.*ollama/i);
});
