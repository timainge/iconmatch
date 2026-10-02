import type { CatalogEntry } from "@iconmatch/core";
import { describe, expect, it } from "vitest";
import { loadRecording, replayFetch } from "../../../../test-support/replay.js";
import { createTablerAdapter } from "../adapters/tabler.js";
import { ingest } from "../ingest.js";
import { renderPng } from "../render.js";
import {
  SYSTEM_PROMPT,
  VISION_PROMPT_VERSION,
  VISION_SYSTEM_PROMPT,
} from "./prompts.js";
import { createOllamaProvider } from "./provider.js";
import { inputHash } from "./text.js";
import { enrichVision, isReadableName, needsVision } from "./vision.js";

const entry = (name: string, tags: string[]): CatalogEntry => ({
  id: `tabler:${name}`,
  set: "tabler",
  name,
  label: name,
  tags,
  categories: [],
  variants: ["outline"],
  license: "MIT",
});

describe("sparse selection (visionFor: sparse)", () => {
  it.each([
    ["heart", true],
    ["arrow-bar-to-down", true],
    ["zoom-in", true],
    ["device-tv", true],
    // Known limit of a simple rule: 3-letter abbreviations pass.
    ["http-que-off", true],
    ["h-1", false],
    ["a-b-2", false],
    ["ce", false],
    ["number-37-small", false],
  ])("isReadableName(%s) = %s", (name, readable) => {
    expect(isReadableName(name)).toBe(readable);
  });

  it("needs vision with < 3 tags or an unreadable name", () => {
    expect(needsVision(entry("heart", ["love", "like", "emotion"]))).toBe(
      false,
    );
    expect(needsVision(entry("heart", ["love", "like"]))).toBe(true);
    expect(needsVision(entry("a-b-2", ["a", "b", "c"]))).toBe(true);
  });

  it("selects a minority of the real catalog", async () => {
    const { catalog } = await ingest([
      createTablerAdapter({ log: () => undefined }),
    ]);
    const eligible = catalog.filter((e) => !e.glyph);
    const sparse = eligible.filter(needsVision).length;
    expect(sparse).toBeGreaterThan(0);
    expect(sparse / eligible.length).toBeLessThan(0.5);
  });
});

describe("enrichVision", () => {
  it("sends the rendered PNG with the vision prompt and returns a vision-mode Enrichment", async () => {
    const r = replayFetch([await loadRecording("ollama-chat-vision.json")]);
    const provider = createOllamaProvider({
      baseUrl: "http://x",
      model: "qwen2.5vl:7b",
      fetch: r.fetch,
    });
    const body = '<path stroke="currentColor" d="M4 4h16v16H4z"/>';
    const png = renderPng({ body, width: 24, height: 24 });
    const e = await enrichVision(
      provider,
      entry("square", ["shape"]),
      body,
      png,
    );
    const sent = r.sent[0]?.body as {
      messages: { role: string; content: string; images?: string[] }[];
    };
    expect(sent.messages[0]?.content).toBe(VISION_SYSTEM_PROMPT);
    expect(VISION_SYSTEM_PROMPT).not.toBe(SYSTEM_PROMPT);
    expect(VISION_SYSTEM_PROMPT).toMatch(/visibly drawn in the attached image/);
    expect(sent.messages.at(-1)?.images).toEqual([png.toString("base64")]);
    expect(e).toMatchObject({
      id: "tabler:square",
      mode: "vision",
      model: "qwen2.5vl:7b",
      promptVersion: VISION_PROMPT_VERSION,
      inputHash: inputHash(
        body,
        ["shape"],
        VISION_PROMPT_VERSION,
        "qwen2.5vl:7b",
      ),
    });
  });
});
