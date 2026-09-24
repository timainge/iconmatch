import { describe, expect, it } from "vitest";
import { IconMatchCapabilityError } from "./errors.js";
import { createIconMatcher } from "./matcher.js";
import type { Manifest } from "./types.js";

const sets: Manifest["sets"] = [
  {
    id: "tabler",
    version: "3.48.0",
    license: "MIT",
    count: 5166,
    attributionRequired: false,
  },
  {
    id: "cc",
    version: "1.0.0",
    license: "CC-BY-4.0",
    count: 10,
    attributionRequired: true,
    url: "https://example.com/cc",
  },
  {
    id: "legacy",
    version: "0.1.0",
    license: "CC-BY-3.0",
    count: 3,
    attributionRequired: true,
  },
];

describe("matcher.attributions() (spec §8)", () => {
  it("lists only the sets whose licence requires attribution", async () => {
    const m = await createIconMatcher({ catalog: [], manifest: { sets } });
    expect(m.attributions()).toEqual([
      { set: "cc", license: "CC-BY-4.0", url: "https://example.com/cc" },
      { set: "legacy", license: "CC-BY-3.0" },
    ]);
  });

  it("is empty for Tabler (MIT, no attribution required)", async () => {
    const m = await createIconMatcher({
      catalog: [],
      manifest: { sets: sets.slice(0, 1) },
    });
    expect(m.attributions()).toEqual([]);
  });

  it("needs the manifest part", async () => {
    const m = await createIconMatcher({ catalog: [] });
    expect(() => m.attributions()).toThrow(IconMatchCapabilityError);
    expect(() => m.attributions()).toThrow('"manifest"');
  });
});
