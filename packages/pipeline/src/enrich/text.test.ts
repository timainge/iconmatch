import type { CatalogEntry } from "iconmatch";
import { describe, expect, it } from "vitest";
import { loadRecording, replayFetch } from "../../../../test-support/replay.js";
import { PROMPT_VERSION } from "./prompts.js";
import { createOllamaProvider } from "./provider.js";
import {
  EnrichmentValidationError,
  enrichText,
  inputHash,
  MAX_VALIDATION_RETRIES,
} from "./text.js";

const heart: CatalogEntry = {
  id: "tabler:heart",
  set: "tabler",
  name: "heart",
  label: "Heart",
  tags: ["love", "like"],
  categories: ["shapes"],
  variants: ["outline"],
  license: "MIT",
};
const BODY = '<path d="M19.5 12.572L12 20"/>';
const provider = (fetch: Parameters<typeof createOllamaProvider>[0]["fetch"]) =>
  createOllamaProvider({
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen2.5:7b-instruct",
    ...(fetch && { fetch }),
  });

describe("enrichText", () => {
  it("returns a validated Enrichment with model, mode, promptVersion and inputHash", async () => {
    const r = replayFetch([await loadRecording("ollama-chat-text.json")]);
    const e = await enrichText(provider(r.fetch), heart, BODY);
    expect(e).toMatchObject({
      id: "tabler:heart",
      description: "A heart shape outline.",
      model: "qwen2.5:7b-instruct",
      mode: "text",
      promptVersion: PROMPT_VERSION,
      inputHash: inputHash(
        BODY,
        heart.tags,
        PROMPT_VERSION,
        "qwen2.5:7b-instruct",
      ),
    });
    expect(e.concepts.length).toBeGreaterThanOrEqual(5);
    expect(r.sent).toHaveLength(1);
  });

  it("retries invalid output, feeding the problems back to the model", async () => {
    const r = replayFetch([
      await loadRecording("ollama-chat-invalid.json"),
      await loadRecording("ollama-chat-text.json"),
    ]);
    const e = await enrichText(provider(r.fetch), heart, BODY);
    expect(e.concepts).toContain("love");
    const second = r.sent[1]?.body as {
      messages: { role: string; content: string }[];
    };
    expect(second.messages.at(-2)?.role).toBe("assistant");
    expect(second.messages.at(-1)?.content).toMatch(
      /^That reply was invalid: concepts: /,
    );
  });

  it(`gives up after ${String(MAX_VALIDATION_RETRIES)} retries`, async () => {
    const invalid = await loadRecording("ollama-chat-invalid.json");
    const r = replayFetch([invalid, invalid, invalid, invalid]);
    const err = await enrichText(provider(r.fetch), heart, BODY).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(EnrichmentValidationError);
    expect(r.sent).toHaveLength(3);
  });
});

describe("inputHash", () => {
  it("is stable and changes with body, tags, prompt version and model", () => {
    const base = inputHash(BODY, ["a"], "v1", "m");
    expect(inputHash(BODY, ["a"], "v1", "m")).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    for (const other of [
      inputHash(BODY + " ", ["a"], "v1", "m"),
      inputHash(BODY, ["b"], "v1", "m"),
      inputHash(BODY, ["a"], "v2", "m"),
      inputHash(BODY, ["a"], "v1", "n"),
    ]) {
      expect(other).not.toBe(base);
    }
  });
});
