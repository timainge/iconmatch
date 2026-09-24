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
