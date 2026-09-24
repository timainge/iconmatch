/**
 * Example `expandQuery` hook (spec §7.3): asks a local Ollama model for 2–3
 * concrete objects that could visually represent an abstract category name.
 * The library itself ships no LLM; wire this (or any chat API) in yourself.
 */
export interface ExpanderOptions {
  baseUrl?: string;
  model?: string;
  fetch?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<Response>;
}

const SYSTEM = `You help pick an icon for a category in a personal organisation app.
Given a category name, reply with JSON {"objects": [...]}: 2 or 3 concrete, drawable objects
that could represent it (e.g. "Admin" -> ["clipboard", "folder", "stamp"]). Lowercase, 1-3 words each.`;

export function ollamaExpander(
  options: ExpanderOptions = {},
): (query: string) => Promise<string[]> {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(
    /\/+$/,
    "",
  );
  const doFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  return async (query) => {
    const res = await doFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? "qwen2.5:7b-instruct",
        stream: false,
        options: { temperature: 0 },
        format: {
          type: "object",
          properties: {
            objects: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 3,
            },
          },
          required: ["objects"],
        },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: query },
        ],
      }),
    });
    if (!res.ok) throw new Error(`expander: HTTP ${String(res.status)}`);
    const body = (await res.json()) as { message?: { content?: string } };
    const parsed = JSON.parse(body.message?.content ?? "{}") as {
      objects?: unknown;
    };
    return Array.isArray(parsed.objects)
      ? parsed.objects
          .filter((o): o is string => typeof o === "string")
          .slice(0, 3)
      : [];
  };
}
