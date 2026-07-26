import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/obsidianMock.ts", import.meta.url))
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    restoreMocks: true
  }
});
