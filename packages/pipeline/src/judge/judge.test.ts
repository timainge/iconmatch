import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadRecording,
  replayFetch,
  type Recording,
} from "../../../../test-support/replay.js";
import { createOllamaProvider, ProviderError } from "../enrich/provider.js";
import {
  JUDGE_PROMPT_VERSION,
  JUDGE_SYSTEM_PROMPT,
  judgeHash,
  judgeIcon,
  parseJudgeReply,
  readJudgeCache,
  runJudgements,
} from "./judge.js";

const svg = {
  body: '<path fill="none" stroke="currentColor" stroke-width="2" d="M4 4h16v16H4z"/>',
  width: 24,
  height: 24,
};
const provider = (recordings: Recording[]) => {
  const r = replayFetch(recordings);
  return {
    sent: r.sent,
    provider: createOllamaProvider({
      baseUrl: "http://x",
      model: "qwen2.5vl:7b",
      fetch: r.fetch,
    }),
  };
};
/** A synthetic reply that breaks the schema (confidence out of range). */
const invalid = (base: Recording): Recording => ({
  ...base,
  source: "synthetic",
  response: {
    status: 200,
    body: {
      model: "qwen2.5vl:7b",
      message: {
        role: "assistant",
        content: '{"fits": true, "confidence": 3, "reason": "x"}',
      },
      done: true,
    },
  },
});

describe("parseJudgeReply (spec §15.6)", () => {
  it("accepts { fits, confidence, reason } and rejects anything else", () => {
    expect(
      parseJudgeReply('{"fits":false,"confidence":0.8,"reason":" no "}'),
    ).toEqual({
      ok: true,
      value: { fits: false, confidence: 0.8, reason: "no" },
    });
    expect(parseJudgeReply("not json")).toEqual({
      ok: false,
      problems: ["reply is not valid JSON"],
    });
    const bad = parseJudgeReply('{"fits":"yes","confidence":2}');
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.problems.join(" ")).toMatch(/fits.*confidence.*reason/s);
  });
});

describe("judgeIcon on recorded Ollama replies", () => {
  it("sends the judge prompt, the category name and the rendered PNG; returns a hashed judgement", async () => {
    const { provider: p, sent } = provider([
      await loadRecording("ollama-judge-fits.json"),
    ]);
    const j = await judgeIcon(p, {
      query: "Dog grooming",
      iconId: "tabler:dog",
      svg,
    });
    expect(j).toMatchObject({
      query: "Dog grooming",
      iconId: "tabler:dog",
      fits: true,
      model: "qwen2.5vl:7b",
      promptVersion: JUDGE_PROMPT_VERSION,
      hash: judgeHash(
        svg.body,
        "Dog grooming",
        JUDGE_PROMPT_VERSION,
        "qwen2.5vl:7b",
      ),
    });
    expect(j.confidence).toBeGreaterThan(0.5);
    const body = sent[0]?.body as {
      messages: { role: string; content: string; images?: string[] }[];
      format: unknown;
    };
    expect(body.messages[0]).toMatchObject({
      role: "system",
      content: JUDGE_SYSTEM_PROMPT,
    });
    expect(body.messages[1]?.content).toBe("Category name: Dog grooming");
    // A PNG (base64 of the 8-byte PNG signature starts with iVBORw0KGgo).
    expect(body.messages[1]?.images?.[0]).toMatch(/^iVBORw0KGgo/);
    expect(body.format).toMatchObject({
      required: ["fits", "confidence", "reason"],
    });
  });

  it("retries an invalid reply, feeding the problems back", async () => {
    const fits = await loadRecording("ollama-judge-fits.json");
    const { provider: p, sent } = provider([invalid(fits), fits]);
    const j = await judgeIcon(p, {
      query: "Dog grooming",
      iconId: "tabler:dog",
      svg,
    });
    expect(j.fits).toBe(true);
    expect(sent).toHaveLength(2);
    const retry = sent[1]?.body as { messages: { content: string }[] };
    expect(retry.messages.at(-1)?.content).toMatch(
      /That reply was invalid: confidence/,
    );
  });
});

describe("runJudgements", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "iconmatch-judge-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("judges uncached pairs, appends each to the jsonl cache, and reuses it on the next run", async () => {
    const cacheFile = join(dir, "judge.jsonl");
    const [fits, not] = await Promise.all([
      loadRecording("ollama-judge-fits.json"),
      loadRecording("ollama-judge-not.json"),
    ]);
    const items = [
      { query: "Dog grooming", iconId: "tabler:dog", svg },
      {
        query: "Dog grooming",
        iconId: "tabler:calendar",
        svg: { ...svg, body: svg.body + " " },
      },
    ];
    const first = await runJudgements({
      provider: provider([fits, not]).provider,
      items,
      cacheFile,
      concurrency: 1,
    });
    expect(first.stats).toEqual({ judged: 2, cached: 0, failed: [] });
    expect(first.judgements.map((j) => [j.iconId, j.fits])).toEqual([
      ["tabler:dog", true],
      ["tabler:calendar", false],
    ]);
    expect((await readFile(cacheFile, "utf8")).trim().split("\n")).toHaveLength(
      2,
    );
    // Second run: everything cached, no provider calls at all.
    const second = await runJudgements({
      provider: provider([]).provider,
      items,
      cacheFile,
    });
    expect(second.stats).toEqual({ judged: 0, cached: 2, failed: [] });
    expect(second.judgements).toEqual(first.judgements);
  });

  it("collects failures without stopping, and skips malformed cache lines", async () => {
    const cacheFile = join(dir, "judge.jsonl");
    await writeFile(cacheFile, '{"half":\n');
    expect((await readJudgeCache(cacheFile)).size).toBe(0);
    const failing = {
      kind: "ollama" as const,
      model: "m",
      chat: () => Promise.reject(new ProviderError("down", false, 400)),
    };
    const run = await runJudgements({
      provider: failing,
      items: [{ query: "q", iconId: "t:x", svg }],
      cacheFile,
    });
    expect(run.stats.failed).toEqual([{ key: "q / t:x", error: "down" }]);
    expect(run.judgements).toEqual([]);
  });
});
