import type { CatalogEntry } from "iconmatch";
import {
  iconInput,
  VISION_PROMPT_VERSION,
  VISION_SYSTEM_PROMPT,
  visionMessages,
} from "./prompts.js";
import type { EnrichmentProvider } from "./provider.js";
import type { Enrichment } from "./schema.js";
import { enrichWithRetries, inputHash } from "./text.js";

/** Short tokens that are ordinary words, not abbreviations. */
const SHORT_WORDS = new Set([
  "a",
  "an",
  "at",
  "by",
  "go",
  "in",
  "of",
  "off",
  "on",
  "or",
  "to",
  "up",
  "tv",
  "id",
  "ok",
  "x",
]);

/**
 * Spec §6.3 "simple readability check": a name reads poorly if it contains
 * digits or a short token that isn't an ordinary word (e.g. `http-que-off`,
 * `a-b-2`, `ce`).
 */
export function isReadableName(name: string): boolean {
  return name
    .split("-")
    .every((t) => !/\d/.test(t) && (t.length >= 3 || SHORT_WORDS.has(t)));
}

/** `visionFor: "sparse"`: fewer than 3 tags, or a name that fails the readability check. */
export function needsVision(entry: CatalogEntry): boolean {
  return entry.tags.length < 3 || !isReadableName(entry.name);
}

/** Vision-mode enrichment of one base concept from its rendered PNG. */
export async function enrichVision(
  provider: EnrichmentProvider,
  entry: CatalogEntry,
  svgBody: string,
  png: Buffer,
): Promise<Enrichment> {
  const value = await enrichWithRetries(
    provider,
    entry.id,
    VISION_SYSTEM_PROMPT,
    visionMessages(iconInput(entry), png.toString("base64")),
  );
  return {
    id: entry.id,
    ...value,
    model: provider.model,
    mode: "vision",
    promptVersion: VISION_PROMPT_VERSION,
    inputHash: inputHash(
      svgBody,
      entry.tags,
      VISION_PROMPT_VERSION,
      provider.model,
    ),
  };
}
