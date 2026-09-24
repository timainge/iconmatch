/**
 * `vectors.bin` format, shared by the build and the runtime (spec §6.4).
 *
 * int8:    N×dims int8 values, zero-padded to a multiple of 4 bytes, then N
 *          float32 per-vector scales (little-endian). value ≈ q × scale.
 * float32: N×dims float32 values (little-endian).
 *
 * Row order matches `vector-ids.json`; dims and quantisation come from the
 * manifest.
 */

export type Quantisation = "int8" | "float32";

export interface VectorArtifact {
  ids: string[];
  dims: number;
  quantisation: Quantisation;
  /** Embedding model the rows came from (from the manifest), if known. */
  model?: string;
  /** Row-major, `ids.length × dims`. */
  data: Int8Array | Float32Array;
  /** Per-row scales (int8 only). */
  scales?: Float32Array;
}

/** Symmetric int8 quantisation with a per-vector scale. */
export function quantiseInt8(v: ArrayLike<number>): {
  q: Int8Array;
  scale: number;
} {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i] ?? 0));
  const scale = max === 0 ? 1 : max / 127;
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.round((v[i] ?? 0) / scale);
  return { q, scale };
}

const pad4 = (n: number) => (n + 3) & ~3;

/** Expected `vectors.bin` byte length. */
export function vectorsByteLength(
  count: number,
  dims: number,
  quantisation: Quantisation,
): number {
  return quantisation === "int8"
    ? pad4(count * dims) + count * 4
    : count * dims * 4;
}

export function encodeVectors(
  vectors: ArrayLike<number>[],
  dims: number,
  quantisation: Quantisation,
): Uint8Array {
  const out = new Uint8Array(
    vectorsByteLength(vectors.length, dims, quantisation),
  );
  const view = new DataView(out.buffer);
  vectors.forEach((v, row) => {
    if (v.length !== dims) {
      throw new Error(
        `vector ${String(row)} has ${String(v.length)} dims, expected ${String(dims)}`,
      );
    }
    if (quantisation === "int8") {
      const { q, scale } = quantiseInt8(v);
      out.set(new Uint8Array(q.buffer), row * dims);
      view.setFloat32(pad4(vectors.length * dims) + row * 4, scale, true);
    } else {
      for (let i = 0; i < dims; i++)
        view.setFloat32((row * dims + i) * 4, v[i] ?? 0, true);
    }
  });
  return out;
}

export function decodeVectors(
  buffer: ArrayBuffer,
  ids: string[],
  dims: number,
  quantisation: Quantisation,
): VectorArtifact {
  const count = ids.length;
  const expected = vectorsByteLength(count, dims, quantisation);
  if (buffer.byteLength !== expected) {
    throw new Error(
      `vectors.bin is ${String(buffer.byteLength)} bytes; expected ${String(expected)} for ${String(count)}×${String(dims)} ${quantisation}`,
    );
  }
  const view = new DataView(buffer);
  if (quantisation === "int8") {
    const scales = new Float32Array(count);
    for (let r = 0; r < count; r++)
      scales[r] = view.getFloat32(pad4(count * dims) + r * 4, true);
    return {
      ids,
      dims,
      quantisation,
      data: new Int8Array(buffer, 0, count * dims),
      scales,
    };
  }
  const data = new Float32Array(count * dims);
  for (let i = 0; i < data.length; i++) data[i] = view.getFloat32(i * 4, true);
  return { ids, dims, quantisation, data };
}
