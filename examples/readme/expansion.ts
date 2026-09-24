import { createIconMatcher, loadCatalog, loadKeywordIndex } from "iconmatch";
import { packagedSource } from "iconmatch/node";
import { ollamaExpander } from "../query-expansion/ollama-expander.js";

// Optional query expansion: ask any chat model for 2–3 concrete objects that
// could represent an abstract label. The library ships no LLM.
const source = packagedSource();
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source),
  keywordIndex: await loadKeywordIndex(source),
  expandQuery: ollamaExpander({ model: "qwen2.5:7b-instruct" }), // e.g. "Admin" -> clipboard, folder, stamp
});

console.log(await matcher.search("Admin", { limit: 5 }));
