import { defineConfig } from "vitest/config";

// Pick up .env locally; in CI the variables come from the workflow.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  test: {
    env: { DB_POOL_MAX: "1" },
    fileParallelism: false,
  },
});
