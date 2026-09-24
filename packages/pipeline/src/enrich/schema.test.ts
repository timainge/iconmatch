import { describe, expect, it } from "vitest";
import { ENRICHMENT_JSON_SCHEMA, parseModelEnrichment } from "./schema.js";

const valid = {
  description: "A heart shape outline.",
  concepts: [
    "Love",
    "love",
    "  Health ",
    "favourites",
    "dating",
    "wellbeing",
    "charity",
  ],
  domains: ["Relationships", "health"],
};

describe("parseModelEnrichment (spec §6.3 zod schema)", () => {
  it("accepts valid output and normalises lowercase, trims and dedupes", () => {
    const r = parseModelEnrichment(JSON.stringify(valid));
    expect(r).toEqual({
      ok: true,
      value: {
        description: "A heart shape outline.",
        concepts: [
          "love",
          "health",
          "favourites",
          "dating",
          "wellbeing",
          "charity",
        ],
        domains: ["relationships", "health"],
      },
    });
  });

  it.each([
    ["non-JSON", "not json", "the reply is not valid JSON"],
    [
      "description > 160",
      JSON.stringify({ ...valid, description: "x".repeat(161) }),
      "description",
    ],
    [
      "< 5 concepts",
      JSON.stringify({ ...valid, concepts: ["a", "b", "c", "d"] }),
      "concepts",
    ],
    [
      "> 15 concepts",
      JSON.stringify({
        ...valid,
        concepts: Array.from({ length: 16 }, (_, i) => `c${String(i)}`),
      }),
      "concepts",
    ],
    [
      "< 5 after dedupe",
      JSON.stringify({ ...valid, concepts: ["a", "A", "b", "c", "d"] }),
      "concepts",
    ],
    ["no domains", JSON.stringify({ ...valid, domains: [] }), "domains"],
    [
      "> 5 domains",
      JSON.stringify({ ...valid, domains: ["a", "b", "c", "d", "e", "f"] }),
      "domains",
    ],
    [
      "missing field",
      JSON.stringify({ description: "x", concepts: valid.concepts }),
      "domains",
    ],
  ])("rejects %s", (_label, text, where) => {
    const r = parseModelEnrichment(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain(where);
  });

  it("sends a JSON schema with the same limits", () => {
    expect(ENRICHMENT_JSON_SCHEMA.required).toEqual([
      "description",
      "concepts",
      "domains",
    ]);
    expect(ENRICHMENT_JSON_SCHEMA.properties.description.maxLength).toBe(160);
    expect(ENRICHMENT_JSON_SCHEMA.properties.concepts).toMatchObject({
      minItems: 5,
      maxItems: 15,
    });
    expect(ENRICHMENT_JSON_SCHEMA.properties.domains).toMatchObject({
      minItems: 1,
      maxItems: 5,
    });
  });
});
