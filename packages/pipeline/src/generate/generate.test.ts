import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main, type CliIo } from "../cli.js";
import type { ChatRequest, EnrichmentProvider } from "../enrich/provider.js";
import {
  GENERATE_SYSTEM_PROMPT,
  galleryHtml,
  generateCandidates,
  generateMessages,
} from "./generate.js";

const VALID =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></svg>';
const FILLED =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#000"/></svg>';

/** A provider that replies with the queued SVGs in order and records each request. */
function scripted(replies: string[], model = "fake-llm") {
  const requests: ChatRequest[] = [];
  const provider: EnrichmentProvider = {
    kind: "ollama",
    model,
    chat: (req) => {
      requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
      const svg = replies.shift();
      if (svg === undefined) return Promise.reject(new Error("no reply left"));
      return Promise.resolve({ content: JSON.stringify({ svg }), model });
    },
  };
  return { provider, requests };
}

const example = {
  concept: "dog",
  svg: { body: '<path d="M4 4h16"/>', width: 24, height: 24 },
};

describe("generateCandidates (spec §15.7)", () => {
  it("validates each draft, feeds problems back, and keeps a draft that never validates", async () => {
    const { provider, requests } = scripted([
      FILLED,
      VALID,
      FILLED,
      FILLED,
      FILLED,
    ]);
    const [first, second] = await generateCandidates(provider, {
      concept: "Beekeeping",
      examples: [example],
      n: 2,
    });
    expect(first).toMatchObject({ index: 1, attempts: 2, problems: [] });
    expect(first?.body).toContain('<circle cx="12" cy="12" r="8"/>');
    expect(second).toMatchObject({ index: 2, attempts: 3 });
    expect(second?.body).toBeUndefined();
    expect(second?.problems.join(" ")).toMatch(/is filled/);
    // The retry carries the rejection reason back to the model.
    expect(requests[1]?.messages.at(-1)?.content).toMatch(
      /That icon was rejected: .*is filled/,
    );
    expect(requests[0]?.system).toBe(GENERATE_SYSTEM_PROMPT);
    expect(requests[0]?.temperature).toBe(0.8);
  });

  it("builds few-shot turns from the set's own icons, then the concept", () => {
    const m = generateMessages("Pottery", [example]);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m[1]?.content).toBe(
      JSON.stringify({
        svg: '<svg viewBox="0 0 24 24"><path d="M4 4h16"/></svg>',
      }),
    );
    expect(m[2]?.content).toBe("Concept: Pottery");
  });

  it("renders a review gallery that escapes model output", () => {
    const html = galleryHtml(
      [
        {
          concept: "<b>bees</b>",
          candidates: [
            {
              concept: "<b>bees</b>",
              index: 1,
              raw: "",
              problems: ["<script>"],
              attempts: 3,
              model: "m",
              promptVersion: "generate-v1",
            },
          ],
        },
      ],
      [example],
    );
    expect(html).toContain("&lt;b&gt;bees&lt;/b&gt;");
    expect(html).toContain("invalid: &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("iconmatch-build generate", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "iconmatch-generate-"));
    await writeFile(
      join(dir, "iconmatch.config.ts"),
      `export default {
  buildDir: "out",
  enrich: { mode: "none", cacheFile: "cache/enrichment.jsonl" },
  sets: [{
    id: "demo",
    license: { spdx: "MIT", url: "https://example.com", attributionRequired: false },
    variants: ["outline"],
    load: async () => [
      { name: "dog", variants: { outline: { body: "<path d=\\"M4 4h16\\"/>", width: 24, height: 24 } }, tags: ["pet"], categories: [] },
    ],
  }],
};
`,
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes candidate SVGs, candidates.json with judge verdicts, and a gallery", async () => {
    const text = scripted([VALID, FILLED, FILLED, FILLED]);
    const vision: EnrichmentProvider = {
      kind: "ollama",
      model: "fake-vl",
      chat: () =>
        Promise.resolve({
          content: JSON.stringify({
            fits: true,
            confidence: 0.7,
            reason: "a bee hive",
          }),
          model: "fake-vl",
        }),
    };
    const out: string[] = [];
    const io: CliIo = {
      cwd: dir,
      log: (m) => out.push(m),
      error: (m) => out.push(`ERR ${m}`),
      createProvider: (_c, model) =>
        model.includes("vl") ? vision : text.provider,
    };
    expect(await main(["ingest"], io)).toBe(0);
    expect(
      await main(
        ["generate", "--concept", "Beekeeping", "--n", "2", "--judge"],
        io,
      ),
    ).toBe(0);
    expect(out).toContain(
      `generate: 1/2 valid candidates -> ${join(dir, "out", "generated", "index.html")}`,
    );
    const stored = JSON.parse(
      await readFile(join(dir, "out", "generated", "candidates.json"), "utf8"),
    ) as { index: number; body?: string; verdict?: { fits: boolean } }[];
    expect(
      stored.map((c) => [c.index, c.body !== undefined, c.verdict?.fits]),
    ).toEqual([
      [1, true, true],
      [2, false, undefined],
    ]);
    expect(
      await readFile(
        join(dir, "out", "generated", "beekeeping", "candidate-1.svg"),
        "utf8",
      ),
    ).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24"/,
    );
    expect(
      await readFile(join(dir, "out", "generated", "index.html"), "utf8"),
    ).toContain("judge: fits (0.70) a bee hive");
    expect(await main(["generate"], io)).toBe(1);
  });
});
