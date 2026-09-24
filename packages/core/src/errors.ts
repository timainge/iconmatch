/** A matcher method was called without the part it needs (spec §7.0 rule 3). */
export class IconMatchCapabilityError extends Error {
  override name = "IconMatchCapabilityError";
  constructor(
    readonly method: string,
    readonly part: string,
  ) {
    super(
      `${method}() needs the "${part}" part, which was not passed to createIconMatcher`,
    );
  }
}

/**
 * The embedder's model differs from the one the vectors were built with
 * (spec §7.1), so query and document vectors would not be comparable.
 */
export class IconMatchModelMismatchError extends Error {
  override name = "IconMatchModelMismatchError";
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `Embedder modelId "${actual}" does not match the index model "${expected}"; ` +
        "use the same embedding model the data was built with",
    );
  }
}
