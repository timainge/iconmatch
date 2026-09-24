import { z } from "zod";

/** Lowercase, trimmed, whitespace-collapsed. */
const phrase = z
  .string()
  .transform((s) => s.trim().toLowerCase().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(40));

/**
 * What the model must return (spec §6.3). Concepts and domains are
 * normalised (lowercase, deduped) after parsing.
 */
export const ModelEnrichmentSchema = z.object({
  description: z.string().trim().min(1).max(160),
  concepts: z
    .array(phrase)
    .transform((xs) => [...new Set(xs)])
    .pipe(z.array(z.string()).min(5).max(15)),
  domains: z
    .array(phrase)
    .transform((xs) => [...new Set(xs)])
    .pipe(z.array(z.string()).min(1).max(5)),
});

export type ModelEnrichment = z.output<typeof ModelEnrichmentSchema>;

/** A stored enrichment (spec §6.3). */
export interface Enrichment extends ModelEnrichment {
  id: string;
  /** Model name + tag. */
  model: string;
  mode: "text" | "vision";
  promptVersion: string;
  /** Hash of (svg body + tags + promptVersion + model). */
  inputHash: string;
}

/**
 * JSON schema sent as the structured-output format. Written by hand to match
 * the model-facing shape (before normalisation) with limits the model can
 * follow; zod stays the source of truth for validation.
 */
export const ENRICHMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string", maxLength: 160 },
    concepts: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 15,
    },
    domains: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
    },
  },
  required: ["description", "concepts", "domains"],
  additionalProperties: false,
} as const;

/** Parses model output; returns the problems on failure (for the retry message). */
export function parseModelEnrichment(
  text: string,
): { ok: true; value: ModelEnrichment } | { ok: false; problems: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["the reply is not valid JSON"] };
  }
  const result = ModelEnrichmentSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    problems: result.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    ),
  };
}
