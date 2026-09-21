import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Narrowed from Vitest's default `**/*.{test,spec}.*`, which would also
    // collect the Playwright specs under `e2e/` and fail on their
    // `@playwright/test` import. Those specs are named `*.e2e.ts` and
    // Playwright matches them itself, so this is belt and braces — but the
    // failure mode it prevents (a broken `pnpm test`) is loud and confusing,
    // and every unit test already lives under `src/`.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
