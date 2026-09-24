import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CatalogEntry, SvgArtifact } from "iconmatch";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRecording, replayFetch } from "../../../../test-support/replay.js";
import { appendEnrichment, readEnrichmentCache } from "./cache.js";
import {
  createOllamaProvider,
  ProviderError,
  type EnrichmentProvider,
} from "./provider.js";
import {
  currentEnrichments,
  hashFor,
  runEnrichment,
  withBackoff,
} from "./runner.js";

const entry = (
  name: string,
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  id: `tabler:${name}`,
  set: "tabler",
  name,
  label: name,
  tags: [name],
  categories: [],
  variants: ["outline"],
  license: "MIT",
  ...extra,
});
const catalog = [
  entry("heart"),
  entry("dog"),
  entry("cat"),
  entry("square-letter-a", { glyph: "letter" }),
];
const svgs: SvgArtifact = Object.fromEntries(
  catalog.map((e) => [
    e.id,
    { outline: { body: `<path d="${e.name}"/>`, width: 24, height: 24 } },
  ]),
);

let dir: string;
let cacheFile: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "iconmatch-enrich-"));
  cacheFile = join(dir, "cache", "enrichment.jsonl");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Ollama provider replaying the recorded valid reply for every call. */
async function recordedProvider(calls = 20) {
  const ok = await loadRecording("ollama-chat-text.json");
  const r = replayFetch(Array.from({ length: calls }, () => ok));
  return {
    r,
    provider: createOllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5:7b-instruct",
      fetch: r.fetch,
    }),
  };
}

describe("enrichment cache (jsonl)", () => {
  it("appends and reads back by inputHash, skipping malformed lines", async () => {
    const { provider } = await recordedProvider();
    await runEnrichment({ catalog, svgs, provider, cacheFile });
    await writeFile(
      cacheFile,
      (await readFile(cacheFile, "utf8")) + '{"torn": \n',
    );
    const { byHash, malformed } = await readEnrichmentCache(cacheFile);
    expect(byHash.size).toBe(3);
    expect(malformed).toBe(1);
    expect(
      byHash.get(hashFor(entry("heart"), svgs, "qwen2.5:7b-instruct"))?.id,
    ).toBe("tabler:heart");
  });

  it("returns an empty cache when the file doesn't exist", async () => {
    expect(
      (await readEnrichmentCache(join(dir, "nope.jsonl"))).byHash.size,
    ).toBe(0);
  });
});

describe("runEnrichment", () => {
  it("enriches base concepts only (glyphs skipped) and caches each result", async () => {
    const { r, provider } = await recordedProvider();
    const stats = await runEnrichment({ catalog, svgs, provider, cacheFile });
    expect(stats).toMatchObject({
      eligible: 3,
      cached: 0,
      enriched: 3,
      failed: [],
      skippedByLimit: 0,
    });
    expect(r.sent).toHaveLength(3);
    expect((await readFile(cacheFile, "utf8")).trim().split("\n")).toHaveLength(
      3,
    );
  });

  it("skips icons already cached by inputHash (resumable)", async () => {
    const first = await recordedProvider();
    await runEnrichment({
      catalog,
      svgs,
      provider: first.provider,
      cacheFile,
      limit: 1,
    });
    const second = await recordedProvider();
    const stats = await runEnrichment({
      catalog,
      svgs,
      provider: second.provider,
      cacheFile,
    });
    expect(stats).toMatchObject({ cached: 1, enriched: 2 });
    expect(second.r.sent).toHaveLength(2);
    const third = await recordedProvider();
    expect(
      await runEnrichment({
        catalog,
        svgs,
        provider: third.provider,
        cacheFile,
      }),
    ).toMatchObject({ cached: 3, enriched: 0 });
    expect(third.r.sent).toHaveLength(0);
  });

  it("re-enriches when the inputs change (tags → new inputHash)", async () => {
    const { provider } = await recordedProvider();
    await runEnrichment({ catalog, svgs, provider, cacheFile });
    const changed = [entry("heart", { tags: ["love"] }), ...catalog.slice(1)];
    const again = await recordedProvider();
    expect(
      await runEnrichment({
        catalog: changed,
        svgs,
        provider: again.provider,
        cacheFile,
      }),
    ).toMatchObject({
      cached: 2,
      enriched: 1,
    });
  });

  it("--limit processes only N uncached icons", async () => {
    const { r, provider } = await recordedProvider();
    const stats = await runEnrichment({
      catalog,
      svgs,
      provider,
      cacheFile,
      limit: 2,
    });
    expect(stats).toMatchObject({ enriched: 2, skippedByLimit: 1 });
    expect(r.sent).toHaveLength(2);
  });

  it("never exceeds the configured concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const ok = await loadRecording("ollama-chat-text.json");
    const content = (ok.response.body as { message: { content: string } })
      .message.content;
    const provider: EnrichmentProvider = {
      kind: "ollama",
      model: "m",
      async chat() {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { content, model: "m" };
      },
    };
    const many = Array.from({ length: 9 }, (_, i) =>
      entry(`icon-${String(i)}`),
    );
    const manySvgs: SvgArtifact = Object.fromEntries(
      many.map((e) => [
        e.id,
        { outline: { body: e.name, width: 24, height: 24 } },
      ]),
    );
    const stats = await runEnrichment({
      catalog: many,
      svgs: manySvgs,
      provider,
      cacheFile,
      concurrency: 3,
    });
    expect(stats.enriched).toBe(9);
    expect(peak).toBe(3);
  });

  it("backs off exponentially on retryable provider errors, then succeeds", async () => {
    const busy = await loadRecording("ollama-error-503.json");
    const ok = await loadRecording("ollama-chat-text.json");
    const r = replayFetch([busy, busy, ok]);
    const provider = createOllamaProvider({
      baseUrl: "http://x",
      model: "m",
      fetch: r.fetch,
    });
    const slept: number[] = [];
    const stats = await runEnrichment({
      catalog: [entry("heart")],
      svgs,
      provider,
      cacheFile,
      retry: { baseDelayMs: 100 },
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    expect(stats.enriched).toBe(1);
    expect(slept).toEqual([100, 200]);
  });

  it("records failures (validation or non-retryable) without stopping the run", async () => {
    const invalid = await loadRecording("ollama-chat-invalid.json");
    const ok = await loadRecording("ollama-chat-text.json");
    // heart: 3 invalid replies → validation failure; dog, cat: ok.
    const r = replayFetch([invalid, invalid, invalid, ok, ok]);
    const provider = createOllamaProvider({
      baseUrl: "http://x",
      model: "m",
      fetch: r.fetch,
    });
    const stats = await runEnrichment({
      catalog,
      svgs,
      provider,
      cacheFile,
      concurrency: 1,
    });
    expect(stats.enriched).toBe(2);
    expect(stats.failed.map((f) => f.id)).toEqual(["tabler:heart"]);
    expect(stats.failed[0]?.error).toMatch(/failed validation/);
  });
});

describe("withBackoff", () => {
  it("gives up after maxAttempts and rethrows non-retryable errors at once", async () => {
    let calls = 0;
    const sleep = () => Promise.resolve();
    await expect(
      withBackoff(
        () => (calls++, Promise.reject(new ProviderError("busy", true))),
        { maxAttempts: 3 },
        sleep,
      ),
    ).rejects.toThrow("busy");
    expect(calls).toBe(3);
    calls = 0;
    await expect(
      withBackoff(
        () => (calls++, Promise.reject(new ProviderError("bad", false))),
        { maxAttempts: 3 },
        sleep,
      ),
    ).rejects.toThrow("bad");
    expect(calls).toBe(1);
  });
});

it("currentEnrichments returns only entries matching the current inputs and model", async () => {
  const { provider } = await recordedProvider();
  await runEnrichment({ catalog, svgs, provider, cacheFile });
  await appendEnrichment(cacheFile, {
    id: "tabler:dog",
    description: "stale",
    concepts: ["a", "b", "c", "d", "e"],
    domains: ["x"],
    model: "other",
    mode: "text",
    promptVersion: "text-v0",
    inputHash: "stale",
  });
  const current = await currentEnrichments(
    catalog,
    svgs,
    cacheFile,
    "qwen2.5:7b-instruct",
  );
  expect([...current.keys()].sort()).toEqual([
    "tabler:cat",
    "tabler:dog",
    "tabler:heart",
  ]);
  expect(current.get("tabler:dog")?.description).toBe("A heart shape outline.");
  expect(
    (await currentEnrichments(catalog, svgs, cacheFile, "other-model")).size,
  ).toBe(0);
});
