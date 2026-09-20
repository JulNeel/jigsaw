import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The e2e harness's own build directory (see `distDir` in next.config.ts)
    // and Playwright's output — generated code, never ours.
    ".next-e2e/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    // Playwright's fixture API takes a callback named `use`, which the React
    // Hooks rule mistakes for the `use()` hook. Nothing in `e2e/` is React.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
]);

export default eslintConfig;
