import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "coverage",
      "node_modules",
      "build",
      "packages/core/data",
      "packages/pipeline/cache",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "packages/*/bin/*.js", "eval/bin/*.js"],
        },
      },
    },
  },
  {
    files: ["*.js", "packages/*/bin/*.js", "eval/bin/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  // Core must stay browser-safe and light (spec §7.0, §10): Node built-ins only in
  // *.node.ts loaders; transformers.js only in the embedders/ subpath.
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: [
      "packages/core/src/**/*.node.ts",
      "packages/core/src/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(node:|fs$|path$|os$|crypto$|url$|module$|child_process$)",
              message:
                "Core is browser-safe; move Node-only code to a *.node.ts loader.",
            },
            {
              regex: "^@huggingface/transformers",
              message:
                "Only packages/core/src/embedders/ may import transformers.js (optional subpath).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/core/src/embedders/**/*.ts"],
    ignores: [
      "packages/core/src/**/*.node.ts",
      "packages/core/src/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(node:|fs$|path$|os$|crypto$|url$|module$|child_process$)",
              message:
                "Core is browser-safe; move Node-only code to a *.node.ts loader.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
