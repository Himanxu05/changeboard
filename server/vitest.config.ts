import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files share one MongoDB database, so run them one at a time.
    fileParallelism: false,
    env: {
      MONGO_URL: process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017/changeboard_test",
      JWT_SECRET: "test-secret-at-least-32-characters-long",
    },
  },
});
