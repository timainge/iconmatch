import { beforeAll, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { createTransformersEmbedder } from "./embedders/transformers.js";
import {
  IconMatchCapabilityError,
  IconMatchModelMismatchError,
} from "./errors.js";
import { buildKeywordIndex } from "./keyword-index.js";
import { createIconMatcher } from "./matcher.js";
import { svgsFromArtifact } from "./svg.js";
import type { CatalogEntry, Manifest } from "./types.js";
import { IconMatchDimensionError } from "./vector.js";
import {
  decodeVectors,
  encodeVectors,
  type VectorArtifact,
} from "./vectors.js";

const DIMS = 32;
const MODEL = "fake/hash-embedder";

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
  entry("dog", ["pet", "puppy"]),
  entry("calendar", ["date"]),
  entry("heart", ["love"]),
  entry("square-letter-d", ["dog"], { glyph: "letter" }),
];
const manifest: Pick<Manifest, "embedding"> = {
  embedding: {
    model: MODEL,
    dims: DIMS,
    quantisation: "int8",
    queryPrefix: "",
  },
};
let vectors: VectorArtifact;
let dogQuery: Float32Array;

beforeAll(async () => {
  const e = createFakeEmbedder({ dims: DIMS });
  const docs = await e.embed(
    catalog.map((c) => `${c.name} ${c.tags.join(" ")}`),
    "document",
  );
  const ids = catalog.map((c) => c.id);
  vectors = decodeVectors(
    encodeVectors(docs, DIMS, "int8").buffer as ArrayBuffer,
    ids,
    DIMS,
    "int8",
  );
  vectors.model = MODEL;
  [dogQuery = new Float32Array(DIMS)] = await e.embed(["dog puppy"], "query");
});

describe("searchByEmbedding", () => {
  it("ranks by cosine without an embedder, excluding glyphs", async () => {
    const m = await createIconMatcher({ catalog, vectors });
    const results = m.searchByEmbedding(dogQuery, { limit: 5 });
    expect(results[0]).toMatchObject({
      id: "t:dog",
      matchedOn: { keyword: false, vector: true },
    });
    expect(results.map((r) => r.id)).not.toContain("t:square-letter-d");
    expect(results[0]?.confidence).toBeGreaterThan(results[1]?.confidence ?? 1);
    expect(m.searchByEmbedding(dogQuery, { limit: 1 })).toHaveLength(1);
  });

  it("throws IconMatchCapabilityError without vectors", async () => {
    const m = await createIconMatcher({ catalog });
    expect(() => m.searchByEmbedding(dogQuery)).toThrow(
      IconMatchCapabilityError,
    );
    expect(() => m.searchByEmbedding(dogQuery)).toThrow('"vectors"');
  });

  it("validates dims with a clear error", async () => {
    const m = await createIconMatcher({ catalog, vectors });
    expect(() => m.searchByEmbedding(new Float32Array(384))).toThrow(
      IconMatchDimensionError,
    );
    expect(() => m.searchByEmbedding(new Float32Array(384))).toThrow(
      "Query vector has 384 dims; the vector index has 32",
    );
  });
});

describe("embedder / manifest consistency", () => {
  it("rejects an embedder whose modelId differs from the manifest", async () => {
    const embedder = createFakeEmbedder({ dims: DIMS, modelId: "other/model" });
    const err = await createIconMatcher({
      catalog,
      vectors,
      embedder,
      manifest,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IconMatchModelMismatchError);
    expect((err as Error).message).toContain(
      'Embedder modelId "other/model" does not match the index model "fake/hash-embedder"',
    );
  });

  it("checks against the vectors' model when no manifest is passed", async () => {
    const embedder = createFakeEmbedder({ dims: DIMS, modelId: "other/model" });
    await expect(
      createIconMatcher({ catalog, vectors, embedder }),
    ).rejects.toBeInstanceOf(IconMatchModelMismatchError);
    const ok = createFakeEmbedder({ dims: DIMS });
    await expect(
      createIconMatcher({ catalog, vectors, embedder: ok, manifest }),
    ).resolves.toBeDefined();
  });

  it("rejects vectors whose dims differ from the manifest", async () => {
    const wrong = { embedding: { ...manifest.embedding, dims: 384 } } as Pick<
      Manifest,
      "embedding"
    >;
    await expect(
      createIconMatcher({ catalog, vectors, manifest: wrong }),
    ).rejects.toThrow(IconMatchDimensionError);
  });
});

// §7.5 / §11.1 M2: searchByEmbedding, get and svg never load the model.
describe("lazy model loading", () => {
  it("only a text search() loads the model", async () => {
    let imports = 0;
    const embedder = createTransformersEmbedder({
      model: MODEL,
      loadModule: () => {
        imports++;
        return Promise.resolve({
          env: {},
          pipeline: () =>
            Promise.resolve((texts: string[]) =>
              createFakeEmbedder({ dims: DIMS })
                .embed(texts, "document")
                .then((vs) => ({
                  dims: [vs.length, DIMS],
                  data: Float32Array.from(vs.flatMap((v) => [...v])),
                })),
            ),
        } as never);
      },
    });
    const m = await createIconMatcher({
      catalog,
      keywordIndex: buildKeywordIndex(catalog),
      vectors,
      embedder,
      manifest,
      svgs: svgsFromArtifact({
        "t:dog": { outline: { body: "<path/>", width: 24, height: 24 } },
      }),
    });
    m.searchByEmbedding(dogQuery);
    m.get("t:dog");
    await m.svg("t:dog");
    expect(embedder.loaded).toBe(false);
    expect(imports).toBe(0);
    await m.search("dog");
    expect(embedder.loaded).toBe(true);
    expect(imports).toBe(1);
  });
});
