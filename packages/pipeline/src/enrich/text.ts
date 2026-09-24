import { createHash } from "node:crypto";
import type { CatalogEntry } from "iconmatch";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  iconInput,
  textMessages,
} from "./prompts.js";
import type { ChatMessage, EnrichmentProvider } from "./provider.js";
import {
  ENRICHMENT_JSON_SCHEMA,
  parseModelEnrichment,
  type Enrichment,
  type ModelEnrichment,
} from "./schema.js";

/** Spec §6.3: reject and retry up to 2 times on validation failure. */
export const MAX_VALIDATION_RETRIES = 2;

export class EnrichmentValidationError extends Error {
  override name = "EnrichmentValidationError";
  constructor(
    readonly id: string,
    readonly problems: string[],
  ) {
    super(
      `${id}: model output failed validation after ${String(MAX_VALIDATION_RETRIES + 1)} attempts: ${problems.join("; ")}`,
    );
  }
}

/** sha256 of (svg body + tags + promptVersion + model), spec §6.3. */
export function inputHash(
  svgBody: string,
  tags: string[],
  promptVersion: string,
  model: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([svgBody, tags, promptVersion, model]))
    .digest("hex");
}

/**
 * Asks the model, validating each reply; invalid output is fed back with the
 * validation problems and retried up to MAX_VALIDATION_RETRIES times.
 */
export async function enrichWithRetries(
  provider: EnrichmentProvider,
  id: string,
  system: string,
  initial: ChatMessage[],
): Promise<ModelEnrichment> {
  const messages = [...initial];
  let problems: string[] = [];
  for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    const reply = await provider.chat({
      system,
      messages,
      jsonSchema: ENRICHMENT_JSON_SCHEMA,
    });
    const parsed = parseModelEnrichment(reply.content);
    if (parsed.ok) return parsed.value;
    problems = parsed.problems;
    messages.push(
      { role: "assistant", content: reply.content },
      {
        role: "user",
        content: `That reply was invalid: ${problems.join("; ")}. Reply again with JSON only, matching the schema.`,
      },
    );
  }
  throw new EnrichmentValidationError(id, problems);
}

/** Text-mode enrichment of one base concept (spec §6.3). */
export async function enrichText(
  provider: EnrichmentProvider,
  entry: CatalogEntry,
  svgBody: string,
): Promise<Enrichment> {
  const value = await enrichWithRetries(
    provider,
    entry.id,
    SYSTEM_PROMPT,
    textMessages(iconInput(entry)),
  );
  return {
    id: entry.id,
    ...value,
    model: provider.model,
    mode: "text",
    promptVersion: PROMPT_VERSION,
    inputHash: inputHash(svgBody, entry.tags, PROMPT_VERSION, provider.model),
  };
}
