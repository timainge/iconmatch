import { describe, expect, expectTypeOf, it } from "vitest";
import { VARIANT_NAMES, type VariantName } from "@iconmatch/core";
import {
  normaliseTags,
  rawIconProblems,
  type IconSetAdapter,
  type RawIcon,
} from "./types.js";

const heart: RawIcon = {
  name: "heart",
  variants: { outline: { body: "<path d='M0 0'/>", width: 24, height: 24 } },
  tags: ["love", "like"],
  categories: ["shapes"],
};

const adapter: IconSetAdapter = {
  id: "test",
  license: {
    spdx: "MIT",
    url: "https://example.com",
    attributionRequired: false,
  },
  variants: ["outline", "filled"],
  load: () => Promise.resolve([heart]),
};

describe("adapter types", () => {
  it("lists the spec §6.1 variant names", () => {
    expect(VARIANT_NAMES).toEqual([
      "outline",
      "filled",
      "thin",
      "light",
      "bold",
      "duotone",
    ]);
    expectTypeOf<VariantName>().toEqualTypeOf<
      "outline" | "filled" | "thin" | "light" | "bold" | "duotone"
    >();
  });

  it("loads RawIcons through the adapter", async () => {
    expect(await adapter.load()).toEqual([heart]);
  });
});

describe("normaliseTags", () => {
  it("lowercases, trims, collapses spaces, drops empties and dedupes", () => {
    expect(
      normaliseTags([" Love ", "love", "", "Like  It", "LIKE it"]),
    ).toEqual(["love", "like it"]);
  });
});

describe("rawIconProblems", () => {
  it("accepts a valid icon", () => {
    expect(rawIconProblems(heart, adapter)).toEqual([]);
  });

  it("rejects names that are not kebab-case", () => {
    expect(rawIconProblems({ ...heart, name: "Heart_Icon" }, adapter)).toEqual([
      'name "Heart_Icon" is not kebab-case',
    ]);
  });

  it("rejects a name carrying a supported variant suffix", () => {
    expect(
      rawIconProblems({ ...heart, name: "heart-filled" }, adapter),
    ).toEqual(['name carries the variant suffix "-filled"']);
  });

  it("allows names ending in the default variant word", () => {
    expect(
      rawIconProblems({ ...heart, name: "text-outline" }, adapter),
    ).toEqual([]);
  });

  it("allows names that merely end in an unsupported variant word", () => {
    expect(
      rawIconProblems(
        { ...heart, name: "text-bold" },
        { variants: ["outline"] },
      ),
    ).toEqual([]);
  });

  it("rejects icons with no variants or unsupported variants", () => {
    expect(rawIconProblems({ ...heart, variants: {} }, adapter)).toEqual([
      "has no variants",
    ]);
    const thin = { thin: { body: "", width: 24, height: 24 } };
    expect(rawIconProblems({ ...heart, variants: thin }, adapter)).toEqual([
      'variant "thin" is not supported by the adapter',
    ]);
  });

  it("rejects tags that are not lowercase and deduped", () => {
    for (const tags of [["Love"], ["love", "love"]]) {
      expect(rawIconProblems({ ...heart, tags }, adapter)).toEqual([
        "tags are not lowercase and deduped",
      ]);
    }
  });
});
