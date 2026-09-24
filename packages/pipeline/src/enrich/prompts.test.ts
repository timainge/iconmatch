import { describe, expect, it } from "vitest";
import {
  FEW_SHOTS,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  textMessages,
  userMessage,
} from "./prompts.js";
import { parseModelEnrichment } from "./schema.js";

describe("prompts (spec §6.3)", () => {
  it("is versioned", () => {
    expect(PROMPT_VERSION).toMatch(/^text-v\d+$/);
  });

  it("states the task, literal descriptions, metaphors, lowercase concepts and JSON-only", () => {
    expect(SYSTEM_PROMPT).toContain("personal organisation app");
    expect(SYSTEM_PROMPT).toMatch(/No speculation/);
    expect(SYSTEM_PROMPT).toMatch(/metaphorical uses/);
    expect(SYSTEM_PROMPT).toMatch(/lowercase, 1 to 3 words/);
    expect(SYSTEM_PROMPT).toMatch(/JSON only/);
  });

  it("has three valid few-shots: literal object, abstract symbol, UI/action glyph", () => {
    expect(FEW_SHOTS.map((s) => s.icon.name)).toEqual([
      "piggy-bank",
      "anchor",
      "arrow-bar-to-down",
    ]);
    for (const s of FEW_SHOTS) {
      expect(
        parseModelEnrichment(JSON.stringify(s.reply)).ok,
        s.icon.name,
      ).toBe(true);
    }
    // The UI glyph gets few everyday concepts.
    expect(FEW_SHOTS[2]?.reply.concepts.length).toBeLessThanOrEqual(5);
  });

  it("builds few-shot turns followed by the icon to label", () => {
    const msgs = textMessages({
      name: "heart",
      label: "Heart",
      tags: ["love"],
      categories: [],
    });
    expect(msgs.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
    expect(msgs.at(-1)?.content).toBe(
      "Icon name: heart\nLabel: Heart\nTags: love\nCategory: (none)",
    );
    expect(
      userMessage({ name: "x", label: "X", tags: [], categories: ["c"] }),
    ).toContain("Tags: (none)");
  });
});
