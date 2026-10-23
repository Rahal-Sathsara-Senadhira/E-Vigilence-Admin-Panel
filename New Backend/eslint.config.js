import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "coverage/"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "no-console": "error",
      // Layering (docs/19 §4.2): core never imports a business module.
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/core/**/*.js"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/modules/**", "#src/modules/**"],
              message: "core/ must not import business modules (docs/19 §4.2).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.js"],
    rules: { "no-console": "off" },
  },
];
