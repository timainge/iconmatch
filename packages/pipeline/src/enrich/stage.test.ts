import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseKeywordIndex } from "iconmatch";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../../test-support/fake-embedder.js";
import {
  loadRecording,
  recordedEnrichment,
  replayFetch,
} from "../../../../test-support/replay.js";
import { main, type CliIo } from "../cli.js";
import { createOllamaProvider } from "./provider.js";

const CONFIG = `export default {
  buildDir: "out",
  enrich: { mode: "text", cacheFile: "cache/enrichment.jsonl" },
  sets: [{
    id: "demo",
    license: { spdx: "MIT", url: "https://example.com", attributionRequired: false },
    variants: ["outline"],
    load: async () => [
      { name: "heart", variants: { outline: { body: "<path/>", width: 24, height: 24 } }, tags: ["shape"], categories: [] },
    ],
  }],
};
`;

let dir: string;
let io: CliIo;
let out: string[];
let embedder: ReturnType<typeof createFakeEmbedder>;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "iconmatch-enrich-stage-"));
  await writeFile(join(dir, "iconmatch.config.ts"), CONFIG);
  out = [];
  embedder = createFakeEmbedder({ dims: 8 });
  const ok = await loadRecording("ollama-chat-text.json");
  const r = replayFetch([ok, ok, ok]);
  io = {
    cwd: dir,
    log: (m) => out.push(m),
    error: (m) => out.push(`ERR ${m}`),
    createEmbedder: () => embedder,
    createProvider: () =>
      createOllamaProvider({
        baseUrl: "http://x",
        model: "qwen2.5:7b-instruct",
        fetch: r.fetch,
      }),
  };
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it("enrich (text) feeds concepts into the keyword index and the embedding text", async () => {
  expect(await main(["ingest"], io)).toBe(0);
  expect(await main(["enrich", "--limit", "5"], io)).toBe(0);
  expect(out).toContain("enrich: 1 new, 0 cached, 0 failed, 0 left by --limit");
  const enrichments = JSON.parse(
    await readFile(join(dir, "out", "enrichments.json"), "utf8"),
  ) as Record<string, { concepts: string[] }>;
  const recorded = await recordedEnrichment();
  expect(enrichments["demo:heart"]?.concepts).toEqual(recorded.concepts);
  // A concept that appears nowhere in the label or tags, so only enrichment can match it.
  const onlyFromEnrichment = recorded.concepts.find(
    (c) => !/heart|shape/.test(c),
  );
  if (!onlyFromEnrichment) throw new Error("fixture needs a distinct concept");
  expect(await main(["index"], io)).toBe(0);
  const index = parseKeywordIndex(
    await readFile(join(dir, "out", "keyword-index.json"), "utf8"),
  );
  expect(index.search(onlyFromEnrichment).map((r) => r.id as string)).toEqual([
    "demo:heart",
  ]);
  expect(await main(["embed"], io)).toBe(0);
  expect(embedder.calls[0]?.texts[0]).toBe(
    `Heart. Tags: shape. ${recorded.description} Represents: ${recorded.concepts.join(", ")}. Domains: ${recorded.domains.join(", ")}.`,
  );
  // Cache is resolved against the config dir and reused.
  expect(
    (await readFile(join(dir, "cache", "enrichment.jsonl"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(1);
});

it("enrich --mode none writes an empty map so later stages ignore stale enrichment", async () => {
  expect(await main(["ingest"], io)).toBe(0);
  expect(await main(["enrich"], io)).toBe(0);
  expect(await main(["enrich", "--mode", "none"], io)).toBe(0);
  expect(await readFile(join(dir, "out", "enrichments.json"), "utf8")).toBe(
    "{}\n",
  );
});

it("rejects vision (not yet) and bad flags", async () => {
  expect(await main(["ingest"], io)).toBe(0);
  expect(await main(["enrich", "--mode", "vision"], io)).toBe(1);
  expect(await main(["enrich", "--mode", "bogus"], io)).toBe(1);
  expect(await main(["enrich", "--limit", "abc"], io)).toBe(1);
});
