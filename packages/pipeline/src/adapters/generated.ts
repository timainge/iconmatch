import { readFile } from "node:fs/promises";
import { validateIcon } from "../generate/validate.js";
import type { IconSetAdapter, RawIcon } from "./types.js";
import { normaliseTags } from "./types.js";

/**
 * The `generated` icon set (spec §15.7): icons drawn by a local model and
 * approved by a maintainer in `generated/approved.json`. Opt-in: add the
 * adapter to a config's `sets` next to the set it extends.
 */
export interface ApprovedIcon {
  /** Kebab-case icon name, e.g. "beekeeping". */
  name: string;
  /** The concept it was drawn for; becomes a tag. */
  concept: string;
  tags?: string[];
  /** SVG body (re-validated and normalised on load). */
  body: string;
  /** Model and prompt that drew it, and who approved it when. */
  model: string;
  promptVersion: string;
  approvedAt: string;
  approvedBy?: string;
}

export interface ApprovedFile {
  version: 1;
  icons: ApprovedIcon[];
}

export const GENERATED_LICENSE = `MIT License

Copyright (c) 2026 the iconmatch authors

The icons in this set were drawn by a local language model from a text prompt
and reviewed and approved by an iconmatch maintainer. They are released under
the MIT licence:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

/** RawIcons from an approval file; every body must still pass `validateIcon`. */
export function generatedIcons(file: ApprovedFile): RawIcon[] {
  const problems: string[] = [];
  const icons: RawIcon[] = [];
  for (const a of file.icons) {
    const v = validateIcon(a.body);
    if (!v.ok) {
      problems.push(`${a.name}: ${v.problems.join("; ")}`);
      continue;
    }
    icons.push({
      name: a.name,
      variants: { outline: { body: v.body, width: 24, height: 24 } },
      tags: normaliseTags([a.concept, ...(a.tags ?? [])]),
      categories: ["generated"],
      generated: true,
    });
  }
  if (problems.length > 0)
    throw new Error(
      `generated/approved.json has ${String(problems.length)} invalid icon(s):\n${problems.join("\n")}`,
    );
  return icons;
}

export function createGeneratedAdapter(options: {
  /** Path to the approval file, e.g. "generated/approved.json". */
  file: string;
}): IconSetAdapter {
  return {
    id: "generated",
    version: "approved",
    license: {
      spdx: "MIT",
      url: "https://github.com/timainge/iconmatch/blob/main/generated/approved.json",
      attributionRequired: false,
    },
    variants: ["outline"],
    licenseText: () => Promise.resolve(GENERATED_LICENSE),
    async load() {
      const data = JSON.parse(await readFile(options.file, "utf8")) as {
        version?: unknown;
        icons?: unknown;
      };
      if (data.version !== 1 || !Array.isArray(data.icons))
        throw new Error(
          `${options.file}: expected { version: 1, icons: [...] }`,
        );
      return generatedIcons(data as ApprovedFile);
    },
  };
}
