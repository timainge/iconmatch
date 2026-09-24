import { describe, expect, it } from "vitest";
import {
  loadRecording,
  recordedEnrichment,
  replayFetch,
} from "../../../../test-support/replay.js";
import {
  createOllamaProvider,
  createOpenAICompatibleProvider,
  createProvider,
  ProviderError,
  type ChatRequest,
} from "./provider.js";

const schema = {
  type: "object",
  properties: { description: { type: "string" } },
  required: ["description"],
};
const request: ChatRequest = {
  system: "Label icons.",
  messages: [{ role: "user", content: "Icon: heart" }],
  jsonSchema: schema,
};

describe("Ollama provider", () => {
  it("posts /api/chat with stream:false, the JSON schema as format and temperature 0", async () => {
    const r = replayFetch([await loadRecording("ollama-chat-text.json")]);
    const p = createOllamaProvider({
      baseUrl: "http://127.0.0.1:11434/",
      model: "qwen2.5:7b-instruct",
      fetch: r.fetch,
    });
    const reply = await p.chat(request);
    expect(r.sent[0]).toMatchObject({
      url: "http://127.0.0.1:11434/api/chat",
      method: "POST",
      body: {
        model: "qwen2.5:7b-instruct",
        stream: false,
        format: schema,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: "Label icons." },
          { role: "user", content: "Icon: heart" },
        ],
      },
    });
    expect(reply.model).toBe("qwen2.5:7b-instruct");
    expect(JSON.parse(reply.content)).toEqual(await recordedEnrichment());
  });

  it("sends base64 images on the user message for vision", async () => {
    const r = replayFetch([await loadRecording("ollama-chat-vision.json")]);
    const p = createOllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5vl:7b",
      fetch: r.fetch,
    });
    await p.chat({
      ...request,
      messages: [
        { role: "user", content: "Icon: heart", images: ["iVBORw0KGgo="] },
      ],
    });
    expect((r.sent[0]?.body as { messages: unknown[] }).messages[1]).toEqual({
      role: "user",
      content: "Icon: heart",
      images: ["iVBORw0KGgo="],
    });
  });

  it("marks 5xx as retryable ProviderError", async () => {
    const r = replayFetch([await loadRecording("ollama-error-503.json")]);
    const p = createOllamaProvider({
      baseUrl: "http://x",
      model: "m",
      fetch: r.fetch,
    });
    const err = await p.chat(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ retryable: true, status: 503 });
  });

  it("marks network failures retryable and 4xx not retryable", async () => {
    const down = createOllamaProvider({
      baseUrl: "http://x",
      model: "m",
      fetch: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    await expect(down.chat(request)).rejects.toMatchObject({ retryable: true });
    const bad = createOllamaProvider({
      baseUrl: "http://x",
      model: "m",
      fetch: () =>
        Promise.resolve(new Response("model not found", { status: 404 })),
    });
    await expect(bad.chat(request)).rejects.toMatchObject({
      retryable: false,
      status: 404,
    });
  });

  it("rejects replies without message content", async () => {
    const p = createOllamaProvider({
      baseUrl: "http://x",
      model: "m",
      fetch: () =>
        Promise.resolve(new Response(JSON.stringify({ done: true }))),
    });
    await expect(p.chat(request)).rejects.toThrow("no message.content");
  });
});

describe("OpenAI-compatible provider", () => {
  it("posts /chat/completions with response_format json_schema and parses choices[0]", async () => {
    const r = replayFetch([await loadRecording("openai-chat-text.json")]);
    const p = createOpenAICompatibleProvider({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "qwen2.5-7b-instruct",
      apiKey: "lm-studio",
      fetch: r.fetch,
    });
    const reply = await p.chat(request);
    expect(r.sent[0]).toMatchObject({
      url: "http://127.0.0.1:1234/v1/chat/completions",
      headers: { authorization: "Bearer lm-studio" },
      body: {
        model: "qwen2.5-7b-instruct",
        stream: false,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: "enrichment", strict: true, schema },
        },
      },
    });
    expect(JSON.parse(reply.content)).toMatchObject({
      concepts: expect.arrayContaining(["love"]) as unknown,
    });
  });

  it("sends images as image_url data-URL content parts", async () => {
    const r = replayFetch([await loadRecording("openai-chat-text.json")]);
    const p = createOpenAICompatibleProvider({
      baseUrl: "http://h/v1",
      model: "m",
      fetch: r.fetch,
    });
    await p.chat({
      ...request,
      messages: [{ role: "user", content: "Icon: heart", images: ["AAA="] }],
    });
    expect((r.sent[0]?.body as { messages: unknown[] }).messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Icon: heart" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AAA=" } },
      ],
    });
  });
});

it("createProvider picks the implementation from config", () => {
  expect(
    createProvider({ provider: "ollama", baseUrl: "http://x", model: "m" })
      .kind,
  ).toBe("ollama");
  expect(
    createProvider({
      provider: "openai-compatible",
      baseUrl: "http://x",
      model: "m",
    }).kind,
  ).toBe("openai-compatible");
});
