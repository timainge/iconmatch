import { describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { buildKeywordIndex } from "./keyword-index.js";
import {
  createIconMatcher,
  DEFAULT_REMOTE_TIMEOUT_MS,
  IconMatchTimeoutError,
  type RemoteSearch,
} from "./matcher.js";
import type { CatalogEntry, IconMatch } from "./types.js";
import { decodeVectors, encodeVectors } from "./vectors.js";

function entry(
  name: string,
  tags: string[],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    id: `t:${name}`,
    set: "t",
    name,
    label: name,
    tags,
    categories: [],
    variants: ["outline"],
    license: "MIT",
    ...extra,
  };
}

const catalog = [
  entry("dog", ["pet"]),
  entry("scissors", ["grooming"]),
  entry("comb", ["hair"]),
  entry("square-letter-d", ["dog"], { glyph: "letter" }),
];
const keywordIndex = buildKeywordIndex(catalog);

function remoteMatch(
  name: string,
  confidence: number,
  extra: Partial<IconMatch> = {},
): IconMatch {
  return {
    id: `t:${name}`,
    name,
    label: name,
    set: "t",
    score: 0.03,
    confidence,
    variant: "outline",
    availableVariants: ["outline"],
    matchedOn: { keyword: false, vector: true },
    ...extra,
  };
}

function recordingRemote(impl: RemoteSearch) {
  const calls: { query: string; limit: number; signal: AbortSignal }[] = [];
  const remoteSearch: RemoteSearch = (query, opts) => {
    calls.push({ query, ...opts });
    return impl(query, opts);
  };
  return { calls, remoteSearch };
}

describe("remoteSearch part", () => {
  it("fuses remote results with local keyword results and flags remote", async () => {
    const r = recordingRemote(() =>
      Promise.resolve([remoteMatch("comb", 0.8), remoteMatch("scissors", 0.7)]),
    );
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      remoteSearch: r.remoteSearch,
    });
    const results = await m.search("Dog grooming");
    expect(r.calls.map((c) => [c.query, c.limit])).toEqual([
      ["Dog grooming", 50],
    ]);
    const byId = new Map(results.map((x) => [x.id, x]));
    expect(byId.get("t:scissors")?.matchedOn).toEqual({
      keyword: true,
      vector: true,
      remote: true,
    });
    expect(byId.get("t:dog")?.matchedOn).toEqual({
      keyword: true,
      vector: false,
      remote: false,
    });
    expect(byId.get("t:comb")).toMatchObject({
      confidence: 0.8,
      matchedOn: { keyword: false, remote: true },
    });
    // scissors ranks first: it is in both rankings.
    expect(results[0]?.id).toBe("t:scissors");
  });

  it("drops remote fallbacks and glyphs", async () => {
    const remoteSearch: RemoteSearch = () =>
      Promise.resolve([
        remoteMatch("square-letter-d", 0.9),
        remoteMatch("category", 0.1, { isFallback: true }),
        remoteMatch("dog", 0.8),
      ]);
    const m = await createIconMatcher({ catalog, keywordIndex, remoteSearch });
    expect((await m.search("dog")).map((x) => x.id)).toEqual(["t:dog"]);
  });

  it("falls back to local keyword results when the remote rejects, reporting the error", async () => {
    const errors: unknown[] = [];
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      remoteSearch: () => Promise.reject(new Error("503")),
      onRemoteError: (e) => errors.push(e),
    });
    const results = await m.search("dog");
    expect(results.map((x) => x.id)).toEqual(["t:dog"]);
    expect(results[0]?.matchedOn).toEqual({ keyword: true, vector: false });
    expect(errors).toEqual([new Error("503")]);
  });

  it("never waits longer than remoteTimeoutMs, and aborts the request", async () => {
    expect(DEFAULT_REMOTE_TIMEOUT_MS).toBe(1500);
    const r = recordingRemote(() => new Promise<IconMatch[]>(() => undefined));
    const errors: unknown[] = [];
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      remoteSearch: r.remoteSearch,
      remoteTimeoutMs: 20,
      onRemoteError: (e) => errors.push(e),
    });
    const started = Date.now();
    const results = await m.search("dog");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(results.map((x) => x.id)).toEqual(["t:dog"]);
    expect(errors[0]).toBeInstanceOf(IconMatchTimeoutError);
    expect(r.calls[0]?.signal.aborted).toBe(true);
  });

  it("rethrows a remote failure when there is no keyword index to fall back to", async () => {
    const m = await createIconMatcher({
      catalog,
      remoteSearch: () => Promise.reject(new Error("down")),
    });
    await expect(m.search("dog")).rejects.toThrow("down");
  });

  it("uses remote search in place of local vectors (no local embedding)", async () => {
    const embedder = createFakeEmbedder({ dims: 8 });
    const vecs = await createFakeEmbedder({ dims: 8 }).embed(
      catalog.map((c) => c.name),
      "document",
    );
    const vectors = decodeVectors(
      encodeVectors(vecs, 8, "int8").buffer as ArrayBuffer,
      catalog.map((c) => c.id),
      8,
      "int8",
    );
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder,
      remoteSearch: () => Promise.resolve([remoteMatch("comb", 0.9)]),
    });
    expect((await m.search("dog")).map((x) => x.id).sort()).toEqual([
      "t:comb",
      "t:dog",
    ]);
    expect(embedder.calls).toEqual([]);
  });

  it("does not call the remote for an empty query", async () => {
    const r = recordingRemote(() => Promise.resolve([]));
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      remoteSearch: r.remoteSearch,
    });
    await m.search("  ");
    expect(r.calls).toEqual([]);
  });
});
