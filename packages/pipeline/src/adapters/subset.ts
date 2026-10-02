import type { IconSetAdapter } from "./types.js";

/**
 * Wraps an adapter so it only yields the named icons, e.g. the 200-icon
 * fixture subset for the CI build (spec §10). Everything else (id, licence,
 * version) passes through.
 */
export function subsetAdapter(
  adapter: IconSetAdapter,
  names: Iterable<string>,
): IconSetAdapter {
  const keep = new Set(names);
  const wrapped: IconSetAdapter = {
    id: adapter.id,
    license: adapter.license,
    variants: adapter.variants,
    ...(adapter.fallbackIcon !== undefined && {
      fallbackIcon: adapter.fallbackIcon,
    }),
    async load() {
      const icons = (await adapter.load()).filter((i) => keep.has(i.name));
      if (adapter.version !== undefined) wrapped.version = adapter.version;
      return icons;
    },
  };
  if (adapter.licenseText) {
    const text = adapter.licenseText.bind(adapter);
    wrapped.licenseText = () => text();
  }
  return wrapped;
}
