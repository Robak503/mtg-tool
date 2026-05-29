import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";

/**
 * Flat ESLint config (ESLint v10).
 *
 * First adoption on a previously-unlinted codebase, so the posture is
 * pragmatic: rules that catch real bugs are errors; stylistic / cleanup
 * rules are warnings, so `npm run lint` stays green (CI-gateable) while
 * warnings get cleaned up incrementally. Prettier owns formatting, so
 * eslint-config-prettier (last) disables any conflicting style rules.
 */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src-tauri/**",
      "data/**",
      "public/**",
      "scripts/**", // CommonJS build/sync scripts — separate concern
      "**/*.cjs",
      "frontend-placeholder/**",
      "next.config.mjs",
      "eslint.config.mjs",
    ],
  },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      // Real-bug rules: keep as errors.
      "react-hooks/rules-of-hooks": "error",
      ...(nextPlugin.configs?.recommended?.rules ?? {}),
      // Cleanup / advisory: warn so the gate stays green during adoption.
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": "warn",
      "no-empty": "warn",
    },
  },

  // Test files also run under Node; vitest globals are imported, not ambient.
  {
    files: ["**/*.test.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  prettier,
];
