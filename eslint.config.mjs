import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dist-pages/**", "**/dist-electron/**", "**/node_modules/**", "samples/**", "packages/core/scripts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // Deliberate in tests and in the JSON-ish plumbing; the types at the boundaries are checked elsewhere.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
  {
    files: ["e2e/**/*.mjs", "packages/server/**/*.ts", "packages/desktop/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
