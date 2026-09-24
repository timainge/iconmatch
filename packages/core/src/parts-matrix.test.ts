import { beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { loadTabler200 } from "../../../test-support/tabler-200.js";
import { IconMatchCapabilityError } from "./errors.js";
import {
  createIconMatcher,
  type IconMatcher,
  type IconMatcherParts,
} from "./matcher.js";
import { svgsFromArtifact } from "./svg.js";
import { decodeVectors, encodeVectors } from "./vectors.js";

// Spec §7.0 rule 3 / §11.1 M2: createIconMatcher works with any subset of
// parts; each method either works or throws IconMatchCapabilityError naming
// the missing part. Every combination of the optional parts is covered.
const OPTIONAL = [
  "keywordIndex",
  "vectors",
  "embedder",
  "svgs",
  "remoteSearch",
] as const;
type Part = (typeof OPTIONAL)[number];

/** Expected outcome per method: "ok" or the part named in the capability error. */
function expected(has: ReadonlySet<Part>) {
  const canSearch =
    has.has("keywordIndex") ||
    has.has("remoteSearch") ||
    (has.has("vectors") && has.has("embedder"));
  return {
    search: canSearch ? "ok" : "keywordIndex",
    best: canSearch ? "ok" : "keywordIndex",
    searchByEmbedding: has.has("vectors") ? "ok" : "vectors",
    get: "ok",
    svg: has.has("svgs") ? "ok" : "svgs",
  } as const;
}

const combos: Part[][] = Array.from(
  { length: 2 ** OPTIONAL.length },
  (_, mask) => OPTIONAL.filter((_, i) => (mask & (1 << i)) !== 0),
);

const DIMS = 32;
let all: Required<Pick<IconMatcherParts, Part>> &
  Pick<IconMatcherParts, "catalog">;
let queryVector: Float32Array;

beforeAll(async () => {
  const { catalog, keywordIndex, svgs } = await loadTabler200();
  const fake = createFakeEmbedder({ dims: DIMS });
  const docs = await fake.embed(
    catalog.map((e) => `${e.label}. Tags: ${e.tags.join(", ")}.`),
    "document",
  );
  const ids = catalog.map((e) => e.id);
  const vectors = decodeVectors(
    encodeVectors(docs, DIMS, "int8").buffer as ArrayBuffer,
    ids,
    DIMS,
    "int8",
  );
  vectors.model = fake.modelId;
  [queryVector = new Float32Array(DIMS)] = await fake.embed(["dog"], "query");
  const dog = catalog.find((e) => e.id === "tabler:dog");
  if (!dog) throw new Error("fixture lacks tabler:dog");
  all = {
    catalog,
    keywordIndex,
    vectors,
    embedder: createFakeEmbedder({ dims: DIMS }),
    svgs: svgsFromArtifact(svgs),
    remoteSearch: () =>
      Promise.resolve([
        {
          id: dog.id,
          name: dog.name,
          label: dog.label,
          set: dog.set,
          score: 0.03,
          confidence: 0.9,
          variant: "outline",
          availableVariants: ["outline"],
          matchedOn: { keyword: false, vector: true },
        },
      ]),
  };
});

async function outcome(run: () => unknown): Promise<string> {
  try {
    await run();
    return "ok";
  } catch (e) {
    if (e instanceof IconMatchCapabilityError) return e.part;
    throw e;
  }
}

describe.each(
  combos.map((c) => [c.length ? c.join(" + ") : "catalog only", c] as const),
)("parts: %s", (_label, combo) => {
  let m: IconMatcher;
  const has = new Set<Part>(combo);
  beforeAll(async () => {
    const parts: IconMatcherParts = { catalog: all.catalog };
    for (const p of combo) Object.assign(parts, { [p]: all[p] });
    m = await createIconMatcher(parts);
  });

  it("each method works or names the missing part", async () => {
    const got = {
      search: await outcome(() => m.search("dog")),
      best: await outcome(() => m.best("dog")),
      searchByEmbedding: await outcome(() => m.searchByEmbedding(queryVector)),
      get: await outcome(() => m.get("tabler:dog")),
      svg: await outcome(() => m.svg("tabler:dog")),
    };
    expect(got).toEqual(expected(has));
  });

  it("finds tabler:dog when it can search (fake embedder: top 3)", async () => {
    if (expected(has).search !== "ok") return;
    const top3 = (await m.search("dog", { limit: 3 })).map((r) => r.id);
    expect(top3).toContain("tabler:dog");
    expect((await m.best("dog")).isFallback).toBeUndefined();
  });
});

it("covers all 32 combinations", () => {
  expect(combos).toHaveLength(32);
  expect(new Set(combos.map((c) => c.join("+"))).size).toBe(32);
});
