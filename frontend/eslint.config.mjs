import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import checkFile from "eslint-plugin-check-file";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Only `src/` is part of the app; `frontend/lib` and `frontend/hooks` held a stale
// contract client (LF-299). Block relative imports that climb out of `src/` into them.
const outsideSrcImports = Array.from({ length: 8 }, (_, depth) => {
  const up = "../".repeat(depth + 1);
  return {
    files: [`src/${"*/".repeat(depth)}*.{js,jsx,ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [`${up}lib`, `${up}lib/**`, `${up}hooks`, `${up}hooks/**`],
              message: "Import from `@/lib` or `@/hooks` under `src/` instead.",
            },
          ],
        },
      ],
    },
  };
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Enforce proper typing instead of `any` (LF-067).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Enforce kebab-case filenames (LF-302).
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "src/**/*.{js,jsx,ts,tsx}": "KEBAB_CASE" },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  {
    // Flag hard-coded JSX string literals in the App Router (LF-211).
    // UI copy should be extracted into `messages/*.json` and rendered via
    // `next-intl` (e.g. `t("key")`) instead of being inlined.
    files: ["src/app/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: [
            " ",
            ".",
            ",",
            ":",
            ";",
            "!",
            "?",
            "-",
            "—",
            "/",
            "|",
            "•",
            "·",
            "%",
            "&",
            "+",
            "=",
            "(",
            ")",
            "[",
            "]",
            "{",
            "}",
            "<",
            ">",
            "*",
            "#",
            "@",
          ],
        },
      ],
    },
  },
  ...outsideSrcImports,
];

export default eslintConfig;