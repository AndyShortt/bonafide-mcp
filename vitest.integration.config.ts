import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests only — loads the real all-MiniLM-L6-v2 model.
    // Expect the first run to take ~30s while the model downloads.
    // Subsequent runs use the HuggingFace cache (~/.cache/huggingface/hub).
    include: ["src/__tests__/**/*.integration.test.ts"],
    // No timeout override needed — vitest default is 5s per test, but model
    // warm-up can exceed that on first run. Set generously.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
