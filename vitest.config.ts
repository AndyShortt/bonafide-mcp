import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only — integration tests (*.integration.test.ts) are excluded
    // and run separately via `npm run test:integration` (see vitest.integration.config.ts).
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["src/__tests__/**/*.integration.test.ts"],
  },
});
