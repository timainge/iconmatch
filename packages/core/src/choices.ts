/**
 * Choice learning (spec §15.4): remembers which icon a user picked for a
 * category name, so later searches for the same or a similar name prefer it.
 * Core keeps choices in memory only; the app persists `export()` wherever it
 * likes and passes it back to `createChoiceMemory()`. Nothing is sent anywhere.
 */

/** One remembered choice. JSON-safe, so `export()` output can be stored as-is. */
export interface ChoiceEntry {
  /** Normalised query (spec §7.2 step 1). */
  query: string;
  iconId: string;
  /** How many times this icon was chosen for this query. */
  count: number;
  /** Increases with every recording; the latest choice for a query wins. */
  seq: number;
  /** Query embedding, when the matcher had an embedder. */
  vector?: number[];
  /** Model that produced `vector`; only same-model vectors are compared. */
  model?: string;
}

export interface ChoiceMemory {
  /** Remembers a choice. `query` must already be normalised. */
  record(choice: {
    query: string;
    iconId: string;
    vector?: ArrayLike<number>;
    model?: string;
  }): void;
  /** Icons chosen for exactly this normalised query, latest choice first. */
  exact(query: string): ChoiceEntry[];
  /**
   * Choices made for other queries whose embedding is at least `minCosine`
   * similar to `vector` (same `model` only), most similar first, one per icon.
   */
  similar(
    vector: ArrayLike<number>,
    model: string,
    minCosine: number,
  ): (ChoiceEntry & { similarity: number })[];
  /** Forgets every choice for a normalised query (e.g. the user cleared it). */
  forget(query: string): void;
  /** All entries, for persisting. */
  export(): ChoiceEntry[];
}

/** Vector components kept in `export()` (4 decimals is ample for cosine). */
const round = (x: number) => Math.round(x * 1e4) / 1e4;

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}

/** An in-memory `ChoiceMemory`, optionally seeded from a previous `export()`. */
export function createChoiceMemory(entries: ChoiceEntry[] = []): ChoiceMemory {
  const byKey = new Map<string, ChoiceEntry>();
  const key = (query: string, iconId: string) => `${query}\u0000${iconId}`;
  let seq = 0;
  for (const e of entries) {
    byKey.set(key(e.query, e.iconId), { ...e });
    seq = Math.max(seq, e.seq);
  }

  return {
    record({ query, iconId, vector, model }) {
      const k = key(query, iconId);
      const previous = byKey.get(k);
      const entry: ChoiceEntry = {
        query,
        iconId,
        count: (previous?.count ?? 0) + 1,
        seq: ++seq,
      };
      const v = vector ?? previous?.vector;
      const m = vector ? model : previous?.model;
      if (v && m !== undefined) {
        entry.vector = Array.from(v, round);
        entry.model = m;
      }
      byKey.set(k, entry);
    },
    exact(query) {
      return [...byKey.values()]
        .filter((e) => e.query === query)
        .sort((a, b) => b.seq - a.seq);
    },
    similar(vector, model, minCosine) {
      const best = new Map<string, ChoiceEntry & { similarity: number }>();
      for (const e of byKey.values()) {
        if (!e.vector || e.model !== model) continue;
        const similarity = cosine(vector, e.vector);
        if (similarity < minCosine) continue;
        const prev = best.get(e.iconId);
        if (!prev || similarity > prev.similarity)
          best.set(e.iconId, { ...e, similarity });
      }
      return [...best.values()].sort(
        (a, b) => b.similarity - a.similarity || b.seq - a.seq,
      );
    },
    forget(query) {
      for (const [k, e] of byKey) if (e.query === query) byKey.delete(k);
    },
    export() {
      return [...byKey.values()]
        .sort((a, b) => a.seq - b.seq)
        .map((e) => ({ ...e }));
    },
  };
}
