import {
  createIconMatcher,
  fetchSource,
  loadCatalog,
  loadKeywordIndex,
  type IconMatch,
  type SvgBody,
} from "iconmatch";

// Browser: keyword index locally (~2.4 MB), semantic search and SVGs from your
// server (see examples/server). No model download; works keyword-only if the
// server is down.
const source = fetchSource("/iconmatch-data/");
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source),
  keywordIndex: await loadKeywordIndex(source),
  remoteSearch: (q, { limit, signal }) =>
    fetch(
      `/api/icons/search?q=${encodeURIComponent(q)}&limit=${String(limit)}`,
      { signal },
    ).then((r) => r.json() as Promise<IconMatch[]>),
  svgs: {
    get: (id, variant) =>
      fetch(
        `/api/icons/icons/${encodeURIComponent(id)}?variant=${variant}`,
      ).then((r) => r.json() as Promise<SvgBody>),
  },
  minConfidence: 0.5,
});

const suggestion = await matcher.best("Kids' ski gear");
const alternatives = await matcher.search("Kids' ski gear", { limit: 20 }); // for a picker
console.log(suggestion.id, alternatives.length);
