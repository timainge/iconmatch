import { describe, expect, it } from "vitest";
import { QUERY_PREFIX } from "../embedding.js";
import { configureEnv, createTransformersEmbedder } from "./transformers.js";

type Env = Parameters<typeof configureEnv>[0];

/** Fake transformers.js: 3-dim "embeddings" = [length, index, 1] per text. */
function fakeModule(opts: { failFirst?: boolean } = {}) {
  const calls = {
    imports: 0,
    pipelines: [] as unknown[][],
    extracts: [] as unknown[][],
  };
  let fail = opts.failFirst === true;
  const env = {
    remoteHost: "https://huggingface.co/",
    localModelPath: "/models/",
    allowLocalModels: true,
    allowRemoteModels: true,
    cacheDir: null,
  } as unknown as Env;
  const loadModule = () => {
    calls.imports++;
    if (fail) {
      fail = false;
      return Promise.reject(new Error("offline"));
    }
    return Promise.resolve({
      env,
      pipeline: (...args: unknown[]) => {
        calls.pipelines.push(args);
        return Promise.resolve((texts: string[], options: unknown) => {
          calls.extracts.push([texts, options]);
          const data = texts.flatMap((t, i) => [t.length, i, 1]);
          return Promise.resolve({
            dims: [texts.length, 3],
            data: Float32Array.from(data),
          });
        });
      },
    } as never);
  };
  return { calls, env, loadModule };
}

describe("createTransformersEmbedder", () => {
  it("does not import transformers.js or load the model at construction", () => {
    const f = fakeModule();
    const e = createTransformersEmbedder({ loadModule: f.loadModule });
    expect(e.loaded).toBe(false);
    expect(f.calls.imports).toBe(0);
    expect(e.modelId).toBe("Xenova/bge-small-en-v1.5");
  });

  it("lazy-loads once, even for concurrent first queries", async () => {
    const f = fakeModule();
    const e = createTransformersEmbedder({ loadModule: f.loadModule });
    await Promise.all([e.embed(["a"], "query"), e.embed(["b"], "query")]);
    await e.embed(["c"], "document");
    expect(f.calls.imports).toBe(1);
    expect(f.calls.pipelines).toEqual([
      [
        "feature-extraction",
        "Xenova/bge-small-en-v1.5",
        { dtype: "q8", local_files_only: false },
      ],
    ]);
    expect(e.loaded).toBe(true);
  });

  it("prefixes queries only, mean-pools and normalises", async () => {
    const f = fakeModule();
    const e = createTransformersEmbedder({ loadModule: f.loadModule });
    await e.embed(["dog grooming"], "query");
    await e.embed(["Dog. Tags: pet"], "document");
    expect(f.calls.extracts).toEqual([
      [[QUERY_PREFIX + "dog grooming"], { pooling: "mean", normalize: true }],
      [["Dog. Tags: pet"], { pooling: "mean", normalize: true }],
    ]);
  });

  it("splits the batch tensor into one Float32Array per text", async () => {
    const e = createTransformersEmbedder({
      loadModule: fakeModule().loadModule,
    });
    const out = await e.embed(["ab", "cde"], "document");
    expect(out.map((v) => Array.from(v))).toEqual([
      [2, 0, 1],
      [3, 1, 1],
    ]);
    expect(out[0]).toBeInstanceOf(Float32Array);
  });

  it("does nothing for an empty batch", async () => {
    const f = fakeModule();
    expect(
      await createTransformersEmbedder({ loadModule: f.loadModule }).embed(
        [],
        "query",
      ),
    ).toEqual([]);
    expect(f.calls.imports).toBe(0);
  });

  it("passes model, dtype and localOnly through", async () => {
    const f = fakeModule();
    const e = createTransformersEmbedder({
      loadModule: f.loadModule,
      model: "org/other",
      dtype: "fp32",
      localOnly: true,
    });
    await e.load();
    expect(e.modelId).toBe("org/other");
    expect(f.calls.pipelines[0]).toEqual([
      "feature-extraction",
      "org/other",
      { dtype: "fp32", local_files_only: true },
    ]);
    expect(f.env.allowRemoteModels).toBe(false);
  });

  it("retries the load after a failure", async () => {
    const f = fakeModule({ failFirst: true });
    const e = createTransformersEmbedder({ loadModule: f.loadModule });
    await expect(e.embed(["x"], "query")).rejects.toThrow("offline");
    expect(e.loaded).toBe(false);
    expect(await e.embed(["x"], "query")).toHaveLength(1);
    expect(f.calls.imports).toBe(2);
  });
});

describe("configureEnv", () => {
  const env = () => ({ ...fakeModule().env });

  it("uses a mirror URL as the remote host", () => {
    const e = env();
    configureEnv(e, { modelLocation: "https://mirror.example/hf" });
    expect(e.remoteHost).toBe("https://mirror.example/hf/");
    expect(e.allowRemoteModels).toBe(true);
  });

  it("uses a local directory as the local model path", () => {
    const e = env();
    configureEnv(e, {
      modelLocation: "/app/models",
      localOnly: true,
      cacheDir: "/tmp/c",
    });
    expect(e).toMatchObject({
      localModelPath: "/app/models",
      allowLocalModels: true,
      allowRemoteModels: false,
      cacheDir: "/tmp/c",
    });
  });

  it("leaves the Hub defaults alone when no location is given", () => {
    const e = env();
    configureEnv(e, {});
    expect(e).toEqual(env());
  });

  it("restores library defaults before applying, so settings don't leak between embedders", () => {
    const e = env();
    const pristine = { ...e };
    configureEnv(e, {
      modelLocation: "/app/models",
      localOnly: true,
      cacheDir: "/tmp/c",
    });
    configureEnv(e, { cacheDir: "/tmp/other" });
    expect(e).toEqual({ ...pristine, cacheDir: "/tmp/other" });
  });
});
