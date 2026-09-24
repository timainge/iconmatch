import { createIconMatcher, loadCatalog, loadKeywordIndex } from "iconmatch";
import { expect, it } from "vitest";
import { createFakeEmbedder } from "../../test-support/fake-embedder.js";
import { tabler200FullSource } from "../../test-support/full-source.js";
import { ollamaExpander } from "./ollama-expander.js";

const reply = (objects: string[]) =>
  new Response(
    JSON.stringify({
      model: "qwen2.5:7b-instruct",
      message: { role: "assistant", content: JSON.stringify({ objects }) },
      done: true,
    }),
  );

it("asks Ollama for concrete objects and plugs into createIconMatcher", async () => {
  const sent: {
    url: string;
    body: { model: string; messages: { content: string }[] };
  }[] = [];
  const expand = ollamaExpander({
    fetch: (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) as never });
      return Promise.resolve(reply(["clipboard", "folder", "stamp"]));
    },
  });
  expect(await expand("Admin")).toEqual(["clipboard", "folder", "stamp"]);
  expect(sent[0]?.url).toBe("http://127.0.0.1:11434/api/chat");
  expect(sent[0]?.body.messages.at(-1)?.content).toBe("Admin");

  const { source } = await tabler200FullSource(
    createFakeEmbedder({ dims: 16 }),
  );
  const matcher = await createIconMatcher({
    catalog: await loadCatalog(source),
    keywordIndex: await loadKeywordIndex(source),
    expandQuery: ollamaExpander({
      fetch: () => Promise.resolve(reply(["pizza", "coffee"])),
    }),
  });
  const ids = (await matcher.search("Friday treats")).map((r) => r.id);
  expect(ids).toEqual(
    expect.arrayContaining(["tabler:pizza", "tabler:coffee"]),
  );
});

it("rejects on HTTP errors so the matcher can ignore the expansion", async () => {
  const expand = ollamaExpander({
    fetch: () => Promise.resolve(new Response("", { status: 500 })),
  });
  await expect(expand("Admin")).rejects.toThrow("HTTP 500");
});
