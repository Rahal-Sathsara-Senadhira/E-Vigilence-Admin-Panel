import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // Each test file gets its own database on one shared replica set.
    fileParallelism: true,
  },
  // SWC keeps decorator metadata, which NestJS dependency injection needs.
  plugins: [swc.vite({ module: { type: "es6" } })],
});
