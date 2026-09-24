import { builtinModules } from "node:module";
import { build, type Plugin } from "esbuild";

export interface BrowserBundleReport {
  /** Bundled source files (esbuild metafile inputs). */
  inputs: string[];
  /** Imports of Node built-ins, recorded instead of failing the build. */
  nodeImports: string[];
  bytes: number;
}

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

/** Records Node built-in imports (and marks them external) so a test can list them. */
function recordNodeImports(found: string[]): Plugin {
  return {
    name: "record-node-imports",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        const bare = args.path.split("/")[0] ?? "";
        if (
          BUILTINS.has(args.path) ||
          args.path.startsWith("node:") ||
          BUILTINS.has(bare)
        ) {
          found.push(args.path);
          return { path: args.path, external: true };
        }
        return undefined;
      });
    },
  };
}

/**
 * Bundles an entry for the browser the way an app bundler would (spec §7.0
 * rule 1) and reports what went in.
 */
export async function bundleForBrowser(
  entry: string,
): Promise<BrowserBundleReport> {
  const nodeImports: string[] = [];
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: "browser",
    conditions: ["source"],
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [recordNodeImports(nodeImports)],
  });
  return {
    inputs: Object.keys(result.metafile.inputs),
    nodeImports: [...new Set(nodeImports)].sort(),
    bytes: result.outputFiles.reduce((n, f) => n + f.contents.byteLength, 0),
  };
}
