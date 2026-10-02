/**
 * Vision model review (spec §15.6): a local vision model judges whether a
 * rendered icon suits a category name. Used to measure agreement with the
 * human eval labels, to suggest label issues, and to pre-screen generated
 * icons (spec §15.7). Build-time only; the runtime library ships no model.
 */
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SvgBody } from "@iconmatch/core";
import { z } from "zod";
import type { ChatMessage, EnrichmentProvider } from "../enrich/provider.js";
import { withBackoff, type RetryOptions } from "../enrich/runner.js";
import { MAX_VALIDATION_RETRIES } from "../enrich/text.js";
import { renderPng } from "../render.js";

/** Bump whenever the judge prompt changes; part of the cache key. */
export const JUDGE_PROMPT_VERSION = "judge-v1";

export const JUDGE_SYSTEM_PROMPT = `You review icons for a personal organisation app. People name their own categories (for example "Dog grooming", "Super contributions", "Kids' ski gear") and each category gets a small line icon.

You see one black line icon on white and a category name. Decide whether a typical user would happily accept this icon for that category: it should clearly depict the category itself, a recognisable object from it, or a common symbol for it. An icon that is only loosely related, too generic, or depicts something else does not fit.

Reply with JSON only: {"fits": true or false, "confidence": a number from 0 to 1 for how sure you are, "reason": one short sentence}.`;

const JudgeReplySchema = z.object({
  fits: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(300),
});
export type JudgeReply = z.output<typeof JudgeReplySchema>;

export const JUDGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    fits: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", maxLength: 300 },
  },
  required: ["fits", "confidence", "reason"],
} as const;

/** Parses a reply; problems are fed back to the model on retry. */
export function parseJudgeReply(
  text: string,
): { ok: true; value: JudgeReply } | { ok: false; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["reply is not valid JSON"] };
  }
  const r = JudgeReplySchema.safeParse(raw);
  return r.success
    ? { ok: true, value: r.data }
    : {
        ok: false,
        problems: r.error.issues.map(
          (i) => `${i.path.join(".") || "reply"}: ${i.message}`,
        ),
      };
}

/** One stored judgement (a line of the judge cache). */
export interface Judgement extends JudgeReply {
  query: string;
  iconId: string;
  model: string;
  promptVersion: string;
  /** sha256 of (svg body + query + promptVersion + model). */
  hash: string;
}

export function judgeHash(
  svgBody: string,
  query: string,
  promptVersion: string,
  model: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([svgBody, query, promptVersion, model]))
    .digest("hex");
}

export class JudgeValidationError extends Error {
  override name = "JudgeValidationError";
  constructor(
    readonly key: string,
    readonly problems: string[],
  ) {
    super(
      `${key}: judge output failed validation after ${String(MAX_VALIDATION_RETRIES + 1)} attempts: ${problems.join("; ")}`,
    );
  }
}

/** The messages for one judgement: the category name with the rendered icon. */
export function judgeMessages(query: string, png: Buffer): ChatMessage[] {
  return [
    {
      role: "user",
      content: `Category name: ${query}`,
      images: [png.toString("base64")],
    },
  ];
}

/** Judges one icon for one query, validating and retrying like enrichment (spec §6.3). */
export async function judgeIcon(
  provider: EnrichmentProvider,
  item: { query: string; iconId: string; svg: SvgBody },
): Promise<Judgement> {
  const messages = judgeMessages(item.query, renderPng(item.svg));
  let problems: string[] = [];
  for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    const reply = await provider.chat({
      system: JUDGE_SYSTEM_PROMPT,
      messages,
      jsonSchema: JUDGE_JSON_SCHEMA,
      temperature: 0,
    });
    const parsed = parseJudgeReply(reply.content);
    if (parsed.ok)
      return {
        query: item.query,
        iconId: item.iconId,
        ...parsed.value,
        model: provider.model,
        promptVersion: JUDGE_PROMPT_VERSION,
        hash: judgeHash(
          item.svg.body,
          item.query,
          JUDGE_PROMPT_VERSION,
          provider.model,
        ),
      };
    problems = parsed.problems;
    messages.push(
      { role: "assistant", content: reply.content },
      {
        role: "user",
        content: `That reply was invalid: ${problems.join("; ")}. Reply again with JSON only, matching the schema.`,
      },
    );
  }
  throw new JudgeValidationError(`${item.query} / ${item.iconId}`, problems);
}

/** Reads the judge cache (jsonl), keyed by hash; malformed lines are skipped. */
export async function readJudgeCache(
  file: string,
): Promise<Map<string, Judgement>> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw e;
  }
  const out = new Map<string, Judgement>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as Judgement;
      if (typeof j.hash === "string" && typeof j.fits === "boolean")
        out.set(j.hash, j);
    } catch {
      // A half-written line from an interrupted run: skip it.
    }
  }
  return out;
}

export interface JudgeRunStats {
  judged: number;
  cached: number;
  failed: { key: string; error: string }[];
}

/**
 * Judges every (query, icon) pair not already cached, appending each result
 * as it arrives (resumable), with bounded concurrency and backoff on
 * retryable provider errors. Returns every judgement for the items.
 */
export async function runJudgements(options: {
  provider: EnrichmentProvider;
  items: { query: string; iconId: string; svg: SvgBody }[];
  cacheFile: string;
  concurrency?: number;
  retry?: RetryOptions;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}): Promise<{ judgements: Judgement[]; stats: JudgeRunStats }> {
  const sleep =
    options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const cache = await readJudgeCache(options.cacheFile);
  const hashOf = (i: (typeof options.items)[number]) =>
    judgeHash(
      i.svg.body,
      i.query,
      JUDGE_PROMPT_VERSION,
      options.provider.model,
    );
  const stats: JudgeRunStats = { judged: 0, cached: 0, failed: [] };
  const todo = options.items.filter((i) => {
    if (cache.has(hashOf(i))) {
      stats.cached++;
      return false;
    }
    return true;
  });
  await mkdir(dirname(options.cacheFile), { recursive: true });
  let next = 0;
  const worker = async () => {
    for (;;) {
      const item = todo[next++];
      if (!item) return;
      try {
        const j = await withBackoff(
          () => judgeIcon(options.provider, item),
          options.retry ?? {},
          sleep,
        );
        cache.set(j.hash, j);
        await appendFile(options.cacheFile, JSON.stringify(j) + "\n");
        stats.judged++;
        if (stats.judged % 25 === 0)
          options.log?.(
            `judge: ${String(stats.judged)}/${String(todo.length)}`,
          );
      } catch (e) {
        stats.failed.push({
          key: `${item.query} / ${item.iconId}`,
          error: (e as Error).message,
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, options.concurrency ?? 2) }, worker),
  );
  const judgements = options.items.flatMap((i) => {
    const j = cache.get(hashOf(i));
    return j ? [j] : [];
  });
  return { judgements, stats };
}
