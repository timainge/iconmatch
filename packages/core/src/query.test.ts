import { expect, it } from "vitest";
import { normaliseQuery } from "./query.js";

it.each([
  ["  Dog   grooming ", "dog grooming"],
  ["Kids' ski gear", "kids ski gear"],
  ["Dog's bed", "dog bed"],
  ["Dog’s bed", "dog bed"],
  ["T-shirts & socks!", "t-shirts socks"],
  ["2024 taxes (final)", "2024 taxes final"],
  ["Café/Bar", "café bar"],
  ["???", ""],
])("%j -> %j", (raw, normalised) => {
  expect(normaliseQuery(raw)).toBe(normalised);
});
