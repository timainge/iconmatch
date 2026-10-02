import { beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { createChoiceMemory } from "./choices.js";
import { IconMatchCapabilityError } from "./errors.js";
import { buildKeywordIndex } from "./keyword-index.js";
import { createIconMatcher } from "./matcher.js";
import type { CatalogEntry, Embedder } from "./types.js";
import {
  decodeVectors,
  encodeVectors,
  type VectorArtifact,
} from "./vectors.js";

describe("createChoiceMemory", () => {
  it("counts repeats and returns the latest choice for a query first", () => {
    const m = createChoiceMemory();
    m.record({ query: "admin", iconId: "t:settings" });
    m.record({ query: "admin", iconId: "t:briefcase" });
    m.record({ query: "admin", iconId: "t:settings" });
    expect(m.exact("admin").map((e) => [e.iconId, e.count])).toEqual([
      ["t:settings", 2],
      ["t:briefcase", 1],
    ]);
    expect(m.exact("other")).toEqual([]);
  });

  it("finds similar past queries by cosine, same model only, one entry per icon", () => {
    const m = createChoiceMemory();
    m.record({ query: "a", iconId: "t:x", vector: [1, 0], model: "m1" });
    m.record({ query: "b", iconId: "t:y", vector: [0.8, 0.6], model: "m1" });
    m.record({ query: "c", iconId: "t:x", vector: [0.6, 0.8], model: "m1" });
    m.record({ query: "d", iconId: "t:z", vector: [1, 0], model: "m2" });
    expect(
      m.similar([1, 0], "m1", 0.7).map((e) => [e.iconId, e.similarity]),
    ).toEqual([
      ["t:x", 1],
      ["t:y", 0.8],
    ]);
    expect(m.similar([1, 0], "m1", 0.95).map((e) => e.iconId)).toEqual(["t:x"]);
  });

  it("exports JSON-safe entries that seed a new memory, and forgets a query", () => {
    const m = createChoiceMemory();
    m.record({
      query: "pets",
      iconId: "t:dog",
      vector: Float32Array.from([0.123456, -0.5]),
      model: "m",
    });
    m.record({ query: "admin", iconId: "t:settings" });
    const saved = JSON.parse(JSON.stringify(m.export())) as ReturnType<
      typeof m.export
    >;
    expect(saved[0]).toEqual({
      query: "pets",
      iconId: "t:dog",
      count: 1,
      seq: 1,
      vector: [0.1235, -0.5],
      model: "m",
    });
    const restored = createChoiceMemory(saved);
    restored.record({ query: "pets", iconId: "t:cat" });
    expect(restored.exact("pets").map((e) => e.iconId)).toEqual([
      "t:cat",
      "t:dog",
    ]);
    restored.forget("pets");
    expect(restored.exact("pets")).toEqual([]);
    expect(restored.export().map((e) => e.query)).toEqual(["admin"]);
  });
});

function entry(
  name: string,
  tags: string[],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    id: `t:${name}`,
    set: "t",
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " "),
    tags,
    categories: [],
    variants: ["outline"],
    license: "MIT",
    ...extra,
  };
}

const catalog = [
  entry("dog", ["pet", "animal", "puppy"]),
  entry("scissors", ["cut", "grooming", "haircut"]),
  entry("calendar", ["date", "schedule"]),
  entry("settings", ["gear", "config"]),
  entry("category", []),
  entry("square-letter-m", [], { glyph: "letter" }),
];
const keywordIndex = buildKeywordIndex(catalog);
let vectors: VectorArtifact;
const DIMS = 64;

beforeAll(async () => {
  const docs = catalog.map((e) => `${e.label}. Tags: ${e.tags.join(", ")}.`);
  const vecs = await createFakeEmbedder({ dims: DIMS }).embed(docs, "document");
  vectors = decodeVectors(
    encodeVectors(vecs, DIMS, "int8").buffer as ArrayBuffer,
    catalog.map((e) => e.id),
    DIMS,
    "int8",
  );
});

/**
 * Same model id as the fake embedder, but queries embed by their first word
 * only, so "Dog grooming" and "Dog walking" are maximally similar.
 */
function firstWordEmbedder(): Embedder {
  const fake = createFakeEmbedder({ dims: DIMS });
  return {
    modelId: fake.modelId,
    embed: (texts, kind) =>
      fake.embed(
        texts.map((t) => (kind === "query" ? (t.split(/\s+/)[0] ?? t) : t)),
        kind,
      ),
  };
}

describe("matcher choice learning (spec §15.4)", () => {
  it("returns the chosen icon first at full confidence on an exact repeat, so best() never falls back", async () => {
    const choices = createChoiceMemory();
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder: createFakeEmbedder({ dims: DIMS }),
      choices,
      minConfidence: 0.99,
      fallbackIcon: "t:category",
    });
    expect((await m.best("Misc")).isFallback).toBe(true);
    await m.recordChoice("  MISC ", "t:settings");
    const [top] = await m.search("Misc");
    expect(top).toMatchObject({
      id: "t:settings",
      confidence: 1,
      matchedOn: { choice: true },
    });
    expect((await m.best("misc")).id).toBe("t:settings");
    // The latest choice wins.
    await m.recordChoice("Misc", "t:calendar");
    expect((await m.search("Misc")).map((r) => r.id).slice(0, 2)).toEqual([
      "t:calendar",
      "t:settings",
    ]);
  });

  it("lifts icons chosen for similar past queries via an extra ranking", async () => {
    const choices = createChoiceMemory();
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder: firstWordEmbedder(),
      choices,
    });
    const before = (await m.search("Dog walking")).map((r) => r.id);
    await m.recordChoice("Dog grooming", "t:calendar");
    const after = await m.search("Dog walking");
    const calendar = after.find((r) => r.id === "t:calendar");
    expect(calendar?.matchedOn.choice).toBe(true);
    expect(after.map((r) => r.id).indexOf("t:calendar")).toBeLessThan(
      before.indexOf("t:calendar") === -1
        ? Infinity
        : before.indexOf("t:calendar"),
    );
    // A similar (not exact) query keeps its own confidence: no free pass.
    expect(calendar?.confidence).toBeLessThan(1);
  });

  it("ignores past choices below choiceSimilarity, and choices for glyphs", async () => {
    const choices = createChoiceMemory();
    const m = await createIconMatcher({
      catalog,
      keywordIndex,
      vectors,
      embedder: firstWordEmbedder(),
      choices,
      choiceSimilarity: 1.01,
    });
    await m.recordChoice("Dog grooming", "t:calendar");
    expect(
      (await m.search("Dog walking")).some((r) => r.matchedOn.choice),
    ).toBe(false);
    choices.record({ query: "misc", iconId: "t:square-letter-m" });
    expect((await m.search("Misc")).map((r) => r.id)).not.toContain(
      "t:square-letter-m",
    );
  });

  it("works keyword-only (exact repeats only), stores no vector, and validates its inputs", async () => {
    const choices = createChoiceMemory();
    const m = await createIconMatcher({ catalog, keywordIndex, choices });
    await m.recordChoice("Admin", "t:settings");
    expect(choices.export()[0]).toEqual({
      query: "admin",
      iconId: "t:settings",
      count: 1,
      seq: 1,
    });
    expect((await m.best("Admin")).id).toBe("t:settings");
    await expect(m.recordChoice("x", "t:nope")).rejects.toThrow(
      /Unknown icon id t:nope/,
    );
    const without = await createIconMatcher({ catalog, keywordIndex });
    await expect(without.recordChoice("x", "t:dog")).rejects.toBeInstanceOf(
      IconMatchCapabilityError,
    );
  });
});
