import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
    }),
  ],
  test: {
    // Integration tests across multiple files share captain A's single
    // seeded team (roster capped at 5 armies) against one real local
    // Supabase instance. Vitest parallelizes test files by default; with
    // fileParallelism on, concurrent files could collide on that shared
    // roster cap. Serialize file execution to remove that race entirely —
    // see context/changes/data-integrity/reviews/impl-review.md F2.
    fileParallelism: false,
    // tests/e2e/**/*.spec.ts are Playwright specs, run by `npm run
    // test:e2e` in a real browser — not vitest, whose Workers pool can't
    // resolve Playwright's own Node.js dependencies (e.g. node:process).
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
