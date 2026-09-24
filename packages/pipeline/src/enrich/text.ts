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
 * Text-mode enrichment of one base concept. Invalid output is fed back to the
 * model with the validation problems and retried up to twice.
 */
export async function enrichText(
  provider: EnrichmentProvider,
  entry: CatalogEntry,
  svgBody: string,
): Promise<Enrichment> {
  const messages: ChatMessage[] = textMessages(iconInput(entry));
  let problems: string[] = [];
  for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    const reply = await provider.chat({
      system: SYSTEM_PROMPT,
      messages,
      jsonSchema: ENRICHMENT_JSON_SCHEMA,
    });
    const parsed = parseModelEnrichment(reply.content);
    if (parsed.ok) {
      return {
        id: entry.id,
        ...parsed.value,
        model: provider.model,
        mode: "text",
        promptVersion: PROMPT_VERSION,
        inputHash: inputHash(
          svgBody,
          entry.tags,
          PROMPT_VERSION,
          provider.model,
        ),
      };
    }
    problems = parsed.problems;
    messages.push(
      { role: "assistant", content: reply.content },
      {
        role: "user",
        content: `That reply was invalid: ${problems.join("; ")}. Reply again with JSON only, matching the schema.`,
      },
    );
  }
  throw new EnrichmentValidationError(entry.id, problems);
}
