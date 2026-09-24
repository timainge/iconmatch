/**
 * The one small interface the enrichment client talks to (spec §14), with an
 * Ollama implementation and an OpenAI-compatible one (LM Studio, llama.cpp
 * server, vLLM…). Selected in `iconmatch.config.ts`.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Base64-encoded PNG images (vision mode). */
  images?: string[];
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  /** JSON schema the reply must follow (structured output). */
  jsonSchema: Record<string, unknown>;
  temperature?: number;
}

export interface ChatResponse {
  /** Raw assistant text (JSON, to be validated by the caller). */
  content: string;
  /** Model name + tag as reported by the server. */
  model: string;
}

export interface EnrichmentProvider {
  readonly kind: "ollama" | "openai-compatible";
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

/** A failed provider call. `retryable` for network errors, 408, 429 and 5xx. */
export class ProviderError extends Error {
  override name = "ProviderError";
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function postJson(
  doFetch: Fetch,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ProviderError(`${url}: ${(e as Error).message}`, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const retryable =
      res.status === 408 || res.status === 429 || res.status >= 500;
    throw new ProviderError(
      `${url}: HTTP ${String(res.status)} ${text.slice(0, 200)}`,
      retryable,
      res.status,
    );
  }
  return res.json();
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");

export interface ProviderOptions {
  baseUrl: string;
  model: string;
  fetch?: Fetch;
}

/** Ollama `POST /api/chat` with `stream: false` and `format: <JSON schema>`. */
export function createOllamaProvider(
  options: ProviderOptions,
): EnrichmentProvider {
  const doFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const url = `${trimSlash(options.baseUrl)}/api/chat`;
  return {
    kind: "ollama",
    model: options.model,
    async chat(req) {
      const body = {
        model: options.model,
        stream: false,
        format: req.jsonSchema,
        options: { temperature: req.temperature ?? 0 },
        messages: [
          { role: "system", content: req.system },
          ...req.messages.map((m) =>
            m.images?.length ? { ...m } : { role: m.role, content: m.content },
          ),
        ],
      };
      const json = (await postJson(doFetch, url, body)) as {
        model?: string;
        message?: { content?: string };
      };
      const content = json.message?.content;
      if (typeof content !== "string")
        throw new ProviderError(`${url}: no message.content in reply`, false);
      return { content, model: json.model ?? options.model };
    },
  };
}

/** OpenAI-compatible `POST /chat/completions` with `response_format: json_schema` (LM Studio etc.). */
export function createOpenAICompatibleProvider(
  options: ProviderOptions & { apiKey?: string },
): EnrichmentProvider {
  const doFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const url = `${trimSlash(options.baseUrl)}/chat/completions`;
  return {
    kind: "openai-compatible",
    model: options.model,
    async chat(req) {
      const body = {
        model: options.model,
        stream: false,
        temperature: req.temperature ?? 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "enrichment",
            strict: true,
            schema: req.jsonSchema,
          },
        },
        messages: [
          { role: "system", content: req.system },
          ...req.messages.map((m) =>
            m.images?.length
              ? {
                  role: m.role,
                  content: [
                    { type: "text", text: m.content },
                    ...m.images.map((b64) => ({
                      type: "image_url",
                      image_url: { url: `data:image/png;base64,${b64}` },
                    })),
                  ],
                }
              : { role: m.role, content: m.content },
          ),
        ],
      };
      const headers: Record<string, string> = options.apiKey
        ? { authorization: `Bearer ${options.apiKey}` }
        : {};
      const json = (await postJson(doFetch, url, body, headers)) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string")
        throw new ProviderError(
          `${url}: no choices[0].message.content in reply`,
          false,
        );
      return { content, model: json.model ?? options.model };
    },
  };
}

/** Builds the configured provider (`enrich.provider` in iconmatch.config.ts). */
export function createProvider(config: {
  provider: "ollama" | "openai-compatible";
  baseUrl: string;
  model: string;
  fetch?: Fetch;
}): EnrichmentProvider {
  const opts: ProviderOptions = {
    baseUrl: config.baseUrl,
    model: config.model,
  };
  if (config.fetch) opts.fetch = config.fetch;
  return config.provider === "ollama"
    ? createOllamaProvider(opts)
    : createOpenAICompatibleProvider(opts);
}
