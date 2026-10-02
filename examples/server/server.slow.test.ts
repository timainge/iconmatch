import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IconMatch } from "@iconmatch/core";
import type { TransformersEmbedder } from "@iconmatch/core/embedder-transformers";
import { expect } from "vitest";
import { main } from "../../packages/pipeline/src/cli.js";
import { describeSlow, itSlow } from "../../test-support/tiers.js";
import { createServer } from "./server.js";

// §7.7 / M2 audit gap: the server's default construction, packagedSource() +
// the transformers embedder, works on real packaged data and doesn't load the
// model until the first text search.
describeSlow(
  "examples/server with defaults (real packaged data, real model)",
  () => {
    itSlow("builds and packages the data, then serves it lazily", async () => {
      const repo = fileURLToPath(new URL("../../", import.meta.url));
      const build = await mkdtemp(join(tmpdir(), "iconmatch-slow-build-"));
      const logs: string[] = [];
      try {
        const code = await main(
          ["all", "--build-dir", build, "--mode", "none"],
          {
            cwd: repo,
            log: (m) => logs.push(m),
            error: (m) => logs.push(`ERR ${m}`),
          },
        );
        expect(code, logs.join("\n")).toBe(0);
      } finally {
        await rm(build, { recursive: true, force: true });
      }

      const server = await createServer();
      const embedder = server.embedder as TransformersEmbedder;
      expect(embedder.modelId).toBe("Xenova/bge-small-en-v1.5");
      expect(embedder.loaded).toBe(false);

      const svg = await server.handle(
        new Request("http://localhost/icons/tabler:heart.svg"),
      );
      expect(await svg.text()).toMatch(/^<svg /);
      expect(embedder.loaded).toBe(false);

      const res = await server.handle(
        new Request("http://localhost/search?q=Groceries&limit=5"),
      );
      const results = (await res.json()) as IconMatch[];
      expect(embedder.loaded).toBe(true);
      expect(results.map((r) => r.id)).toContain("tabler:shopping-cart");
    });
  },
);
