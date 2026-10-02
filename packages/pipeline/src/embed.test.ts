import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeVectors, type CatalogEntry } from "@iconmatch/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "../../../test-support/fake-embedder.js";
import { documentText, runEmbed, type EmbedMeta } from "./embed.js";

function entry(name: string, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: `t:${name}`,
    set: "t",
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    tags: [],
    categories: [],
    variants: ["outline"],
    license: "MIT",
    ...extra,
  };
}

describe("documentText (spec §6.4)", () => {
  it("composes all sections in order", () => {
    expect(
      documentText(
        entry("shield", {
          tags: ["security", "guard"],
          categories: ["system"],
        }),
        {
          description: "A shield outline",
          concepts: ["insurance", "protection"],
          domains: ["finance"],
        },
      ),
    ).toBe(
      "Shield. Tags: security, guard. Category: system. A shield outline. Represents: insurance, protection. Domains: finance.",
    );
  });

  it("omits empty sections", () => {
    expect(documentText(entry("heart", { tags: ["love"] }))).toBe(
      "Heart. Tags: love.",
    );
    expect(documentText(entry("dot"))).toBe("Dot.");
    expect(
      documentText(entry("x"), {
        description: "  ",
        concepts: [],
        domains: [],
      }),
    ).toBe("X.");
  });
});

describe("runEmbed", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "iconmatch-embed-"));
    const catalog = [
      entry("heart", { tags: ["love"] }),
      entry("dog"),
      entry("calendar"),
    ];
    await writeFile(join(dir, "catalog.json"), JSON.stringify(catalog));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("embeds document text in batches, as documents, and writes the artifacts", async () => {
    const embedder = createFakeEmbedder({ dims: 16 });
    const meta = await runEmbed(dir, { embedder, batchSize: 2 });
    expect(meta).toEqual({
      model: "fake/hash-embedder",
      dims: 16,
      quantisation: "int8",
      count: 3,
    });
    expect(embedder.calls).toEqual([
      { texts: ["Heart. Tags: love.", "Dog."], kind: "document" },
      { texts: ["Calendar."], kind: "document" },
    ]);
    const ids = JSON.parse(
      await readFile(join(dir, "vector-ids.json"), "utf8"),
    ) as string[];
    expect(ids).toEqual(["t:heart", "t:dog", "t:calendar"]);
    const written = JSON.parse(
      await readFile(join(dir, "embed-meta.json"), "utf8"),
    ) as EmbedMeta;
    expect(written).toEqual(meta);
    const bin = await readFile(join(dir, "vectors.bin"));
    const art = decodeVectors(new Uint8Array(bin).buffer, ids, 16, "int8");
    expect(art.data).toHaveLength(48);
  });

  it("stores float32 when asked", async () => {
    const meta = await runEmbed(dir, {
      embedder: createFakeEmbedder({ dims: 4 }),
      quantisation: "float32",
    });
    expect(meta.quantisation).toBe("float32");
    expect((await readFile(join(dir, "vectors.bin"))).byteLength).toBe(
      3 * 4 * 4,
    );
  });

  it("uses enrichment text when given", async () => {
    const embedder = createFakeEmbedder({ dims: 4 });
    await runEmbed(dir, {
      embedder,
      enrichments: new Map([["t:dog", { concepts: ["pet"] }]]),
    });
    expect(embedder.calls[0]?.texts[1]).toBe("Dog. Represents: pet.");
  });
});
