/**
 * `iconmatch/embedder-transformers`: a local Embedder on transformers.js
 * (spec §7.0, §7.5). The only module that imports `@huggingface/transformers`,
 * an optional peer dependency, and only when the first text is embedded.
 */
import type * as Transformers from "@huggingface/transformers";
import { DEFAULT_EMBEDDING_MODEL, embeddingInput } from "../embedding.js";
import type { Embedder } from "../types.js";

type TransformersModule = Pick<typeof Transformers, "pipeline" | "env">;

export interface TransformersEmbedderOptions {
  /** Hub model id; also the Embedder `modelId`. Default `Xenova/bge-small-en-v1.5`. */
  model?: string;
  /**
   * Where to load the model from: omitted for the Hugging Face Hub, an
   * `http(s)://` mirror URL, or a local directory holding `<model>/...`.
   */
  modelLocation?: string;
  /** Never touch the network; load only local or cached files. */
  localOnly?: boolean;
  /** Download cache directory (Node). */
  cacheDir?: string;
  /** ONNX weights: "q8" (quantised, default) or "fp32". */
  dtype?: "q8" | "fp32";
  /** Test seam: supplies the transformers.js module instead of importing it. */
  loadModule?: () => Promise<TransformersModule>;
}

export interface TransformersEmbedder extends Embedder {
  /** True once the model has been requested. Never set by construction. */
  readonly loaded: boolean;
  /** Loads the model now instead of on the first `embed()` (e.g. to warm up). */
  load(): Promise<void>;
}

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ dims: readonly number[]; data: ArrayLike<number> }>;

type EnvKey =
  | "remoteHost"
  | "localModelPath"
  | "allowLocalModels"
  | "allowRemoteModels"
  | "cacheDir";
const ENV_KEYS: readonly EnvKey[] = [
  "remoteHost",
  "localModelPath",
  "allowLocalModels",
  "allowRemoteModels",
  "cacheDir",
];
const envDefaults = new WeakMap<
  object,
  Pick<TransformersModule["env"], EnvKey>
>();

/**
 * Applies model location and offline settings to the transformers.js env.
 * The env is process-global, so the library defaults are captured on first
 * use and restored first; one embedder's settings never leak into the next.
 */
export function configureEnv(
  env: TransformersModule["env"],
  options: Pick<
    TransformersEmbedderOptions,
    "modelLocation" | "localOnly" | "cacheDir"
  >,
): void {
  let defaults = envDefaults.get(env);
  if (!defaults) {
    defaults = Object.fromEntries(ENV_KEYS.map((k) => [k, env[k]])) as Pick<
      TransformersModule["env"],
      EnvKey
    >;
    envDefaults.set(env, defaults);
  }
  Object.assign(env, defaults);
  const location = options.modelLocation;
  if (location !== undefined && /^https?:\/\//.test(location)) {
    env.remoteHost = location.endsWith("/") ? location : `${location}/`;
  } else if (location !== undefined) {
    env.localModelPath = location;
    env.allowLocalModels = true;
  }
  if (options.localOnly === true) env.allowRemoteModels = false;
  if (options.cacheDir !== undefined) env.cacheDir = options.cacheDir;
}

export function createTransformersEmbedder(
  options: TransformersEmbedderOptions = {},
): TransformersEmbedder {
  const modelId = options.model ?? DEFAULT_EMBEDDING_MODEL;
  let extractor: Promise<Extractor> | undefined;

  const getExtractor = (): Promise<Extractor> => {
    extractor ??= (async () => {
      const mod = await (
        options.loadModule ?? (() => import("@huggingface/transformers"))
      )();
      configureEnv(mod.env, options);
      const pipe = await mod.pipeline("feature-extraction", modelId, {
        dtype: options.dtype ?? "q8",
        local_files_only: options.localOnly === true,
      });
      return pipe as unknown as Extractor;
    })();
    // Let a failed load be retried on the next call.
    extractor.catch(() => {
      extractor = undefined;
    });
    return extractor;
  };

  return {
    modelId,
    get loaded() {
      return extractor !== undefined;
    },
    async load() {
      await getExtractor();
    },
    async embed(texts, kind) {
      if (texts.length === 0) return [];
      const extract = await getExtractor();
      // Mean pooling + L2 normalisation, per the model card (spec §6.4).
      const out = await extract(
        texts.map((t) => embeddingInput(t, kind)),
        { pooling: "mean", normalize: true },
      );
      const dims = out.dims[out.dims.length - 1] ?? 0;
      return texts.map((_, i) =>
        Float32Array.from(
          Array.prototype.slice.call(
            out.data,
            i * dims,
            (i + 1) * dims,
          ) as number[],
        ),
      );
    },
  };
}
