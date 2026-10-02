/**
 * Experimental icon generation (spec §15.7): a local LLM drafts SVG icons for
 * concepts the set lacks, in the set's style. Build-time only. Every draft is
 * validated and normalised (`validateIcon`); valid drafts can be scored by the
 * vision judge (spec §15.6) and are reviewed by a human before any of them
 * ships, as a separate `generated` set.
 */
import type { SvgBody } from "@iconmatch/core";
import type { ChatMessage, EnrichmentProvider } from "../enrich/provider.js";
import { withBackoff, type RetryOptions } from "../enrich/runner.js";
import { MAX_VALIDATION_RETRIES } from "../enrich/text.js";
import { validateIcon, type LintLimits } from "./validate.js";

/** Bump whenever the generation prompt or examples change. */
export const GENERATE_PROMPT_VERSION = "generate-v1";

export const GENERATE_SYSTEM_PROMPT = `You draw simple line icons for an icon set. Every icon is drawn on a 24 by 24 grid with 2-pixel round strokes and no fills, like the examples.

Rules:
- Use only <path>, <line>, <circle>, <rect>, <polyline> and <ellipse>.
- Keep every coordinate between 2 and 22.
- No fills, no text, no transforms, no colours: strokes only.
- Use at most 10 elements. Prefer a few bold, recognisable shapes over detail.
- Draw the most recognisable object or symbol for the concept.

Reply with JSON only: {"svg": "<svg viewBox=\\"0 0 24 24\\">…</svg>"}.`;

export const GENERATE_JSON_SCHEMA = {
  type: "object",
  properties: { svg: { type: "string" } },
  required: ["svg"],
} as const;

/** One worked example from the target set. */
export interface StyleExample {
  concept: string;
  svg: SvgBody;
}

export interface Candidate {
  concept: string;
  /** 1-based. */
  index: number;
  /** Final raw SVG the model returned (after any retries). */
  raw: string;
  /** Normalised body when valid. */
  body?: string;
  problems: string[];
  /** Model calls this candidate took (1 + validation retries). */
  attempts: number;
  model: string;
  promptVersion: string;
}

const exampleSvg = (body: string) => `<svg viewBox="0 0 24 24">${body}</svg>`;

/** Few-shot turns from the set's real icons, then the concept to draw. */
export function generateMessages(
  concept: string,
  examples: readonly StyleExample[],
): ChatMessage[] {
  return [
    ...examples.flatMap((e): ChatMessage[] => [
      { role: "user", content: `Concept: ${e.concept}` },
      {
        role: "assistant",
        content: JSON.stringify({ svg: exampleSvg(e.svg.body) }),
      },
    ]),
    { role: "user", content: `Concept: ${concept}` },
  ];
}

function extractSvg(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as { svg?: unknown };
    return typeof parsed.svg === "string" ? parsed.svg : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Drafts `n` candidates for a concept. Each draft is validated; an invalid
 * one is sent back with its problems, up to MAX_VALIDATION_RETRIES times.
 * Invalid final drafts are kept (with their problems) so the review shows them.
 */
export async function generateCandidates(
  provider: EnrichmentProvider,
  options: {
    concept: string;
    examples: readonly StyleExample[];
    n: number;
    /** Sampling temperature; above 0 so the drafts differ. Default 0.8. */
    temperature?: number;
    limits?: LintLimits;
    /** Backoff for retryable provider errors (network, 5xx), as in enrichment. */
    retry?: RetryOptions;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<Candidate[]> {
  const sleep =
    options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: Candidate[] = [];
  for (let index = 1; index <= options.n; index++) {
    const messages = generateMessages(options.concept, options.examples);
    let raw = "";
    let problems: string[] = [];
    let attempts = 0;
    let body: string | undefined;
    for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
      attempts++;
      const reply = await withBackoff(
        () =>
          provider.chat({
            system: GENERATE_SYSTEM_PROMPT,
            messages,
            jsonSchema: GENERATE_JSON_SCHEMA,
            temperature: options.temperature ?? 0.8,
          }),
        options.retry ?? {},
        sleep,
      );
      const svg = extractSvg(reply.content);
      raw = svg ?? reply.content;
      const result = svg
        ? validateIcon(svg, options.limits)
        : {
            ok: false as const,
            problems: ['reply is not JSON with an "svg" string'],
          };
      if (result.ok) {
        body = result.body;
        problems = [];
        break;
      }
      problems = result.problems;
      messages.push(
        { role: "assistant", content: reply.content },
        {
          role: "user",
          content: `That icon was rejected: ${problems.join("; ")}. Draw it again following the rules, JSON only.`,
        },
      );
    }
    out.push({
      concept: options.concept,
      index,
      raw,
      ...(body !== undefined && { body }),
      problems,
      attempts,
      model: provider.model,
      promptVersion: GENERATE_PROMPT_VERSION,
    });
  }
  return out;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Judge verdict shown next to a candidate, when the judge ran. */
export interface CandidateVerdict {
  fits: boolean;
  confidence: number;
  reason: string;
}

/**
 * A static review page: each concept's candidates rendered at 48px next to
 * reference icons from the set, with validation problems and judge verdicts.
 */
export function galleryHtml(
  rows: {
    concept: string;
    candidates: (Candidate & { verdict?: CandidateVerdict })[];
  }[],
  references: readonly StyleExample[],
): string {
  const icon = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">${body}</svg>`;
  const refs = references
    .map(
      (r) =>
        `<figure>${icon(r.svg.body)}<figcaption>${escapeHtml(r.concept)}</figcaption></figure>`,
    )
    .join("");
  const sections = rows
    .map((row) => {
      const cells = row.candidates
        .map((c) => {
          const verdict = c.verdict
            ? `<p class="${c.verdict.fits ? "fit" : "nofit"}">judge: ${c.verdict.fits ? "fits" : "no"} (${c.verdict.confidence.toFixed(2)}) ${escapeHtml(c.verdict.reason)}</p>`
            : "";
          return c.body
            ? `<figure>${icon(c.body)}<figcaption>#${String(c.index)} · ${String(c.attempts)} attempt(s)</figcaption>${verdict}</figure>`
            : `<figure class="invalid"><div class="x">✕</div><figcaption>#${String(c.index)} invalid: ${escapeHtml(c.problems.join("; "))}</figcaption></figure>`;
        })
        .join("");
      return `<section><h2>${escapeHtml(row.concept)}</h2><div class="row">${cells}</div></section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Generated icon candidates</title>
<style>
body{font:14px system-ui,sans-serif;margin:24px;color:#111;background:#fff}
.row{display:flex;flex-wrap:wrap;gap:16px}
figure{margin:0;width:160px;padding:8px;border:1px solid #ddd;border-radius:8px}
figure svg{display:block;margin:8px auto;color:#111}
figcaption{font-size:12px;color:#555}
.invalid{background:#fafafa}.x{font-size:32px;text-align:center;color:#bbb}
.fit{color:#16794c;font-size:12px}.nofit{color:#a33;font-size:12px}
</style></head><body>
<h1>Generated icon candidates</h1>
<p>Reference icons from the set (the style to match):</p><div class="row">${refs}</div>
${sections}
<p>Approve a candidate by adding it to <code>generated/approved.json</code> (spec §15.7). Nothing here ships until a human approves it.</p>
</body></html>
`;
}
