import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

// Import boundaries from docs/18 §10:
//   ui/      never imports domain/, features/ or lib/ (looks only)
//   domain/  never imports features/
//   features never reach into another feature's folders, only its index.js
const restricted = (/** @type {{ group: string[], message: string }[]} */ patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/ui/**"],
    rules: restricted([
      {
        group: ["@/domain/*", "@/features/*", "@/lib/*", "@/app/*"],
        message: "ui/ is looks only — it must not know about the business (docs/18 §10).",
      },
    ]),
  },
  {
    files: ["src/domain/**"],
    rules: restricted([
      {
        group: ["@/features/*", "@/app/*"],
        message: "domain/ must not import features (docs/18 §10).",
      },
    ]),
  },
  {
    files: ["src/features/**"],
    rules: restricted([
      {
        group: ["@/features/*/*", "!@/features/*/index.js"],
        message: "Import another feature through its index.js only (docs/18 §10).",
      },
    ]),
  },
  {
    files: ["vite.config.js", "scripts/**"],
    languageOptions: { globals: globals.node },
  },
]);
