import { readFile } from "node:fs/promises";
import { fixturePath } from "./fixtures.js";

/** One recorded HTTP exchange (see fixtures/ollama/README.md). */
export interface Recording {
  /** "recorded" = captured from a real server; "synthetic" = written from the API docs. */
  source: "recorded" | "synthetic";
  request: { method: string; url: string; body: unknown };
  response: { status: number; body: unknown };
}

export async function loadRecording(name: string): Promise<Recording> {
  return JSON.parse(
    await readFile(fixturePath("ollama", name), "utf8"),
  ) as Recording;
}

/**
 * A fetch that replays recordings in order and records what was sent, so a
 * test can compare the real request with the recorded one. No network.
 */
export function replayFetch(recordings: Recording[]) {
  const sent: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
  }[] = [];
  let i = 0;
  const fetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    sent.push({
      url,
      method: init.method,
      headers: init.headers,
      body: JSON.parse(init.body) as unknown,
    });
    const rec = recordings[i++];
    if (!rec)
      return Promise.reject(
        new Error(`replayFetch: no recording left for ${url}`),
      );
    return Promise.resolve(
      new Response(
        typeof rec.response.body === "string"
          ? rec.response.body
          : JSON.stringify(rec.response.body),
        {
          status: rec.response.status,
          headers: { "content-type": "application/json" },
        },
      ),
    );
  };
  return { fetch, sent };
}

/** The enrichment JSON inside a recorded Ollama reply (message.content), parsed. */
export async function recordedEnrichment(
  name = "ollama-chat-text.json",
): Promise<{ description: string; concepts: string[]; domains: string[] }> {
  const rec = await loadRecording(name);
  const body = rec.response.body as { message: { content: string } };
  return JSON.parse(body.message.content) as {
    description: string;
    concepts: string[];
    domains: string[];
  };
}
