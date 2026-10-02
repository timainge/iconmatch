import * as api from "@iconmatch/core";
import * as node from "@iconmatch/core/node";
import * as transformers from "@iconmatch/core/embedder-transformers";
import { expect, it } from "vitest";

// The primitives spec §7.0 names must be importable from the package entry
// points, not just from source files.
it("the default entry exports every §7.0 primitive", () => {
  const names = [
    "fetchSource",
    "memorySource",
    "loadManifest",
    "loadCatalog",
    "loadKeywordIndex",
    "loadVectors",
    "loadSvgs",
    "createKeywordSearcher",
    "createVectorSearcher",
    "fuse",
    "hybridConfidence",
    "svgsFromArtifact",
    "renderSvg",
    "letterFallback",
    "createIconMatcher",
    "normaliseQuery",
    "QUERY_PREFIX",
    "IconMatchCapabilityError",
    "IconMatchModelMismatchError",
    "IconMatchDimensionError",
  ];
  const missing = names.filter((n) => !(n in api));
  expect(missing).toEqual([]);
});

it("the subpaths export their parts", () => {
  expect(typeof node.fsSource).toBe("function");
  expect(typeof node.packagedSource).toBe("function");
  expect(typeof transformers.createTransformersEmbedder).toBe("function");
});
