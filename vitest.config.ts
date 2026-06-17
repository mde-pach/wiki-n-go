import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Parallel sessions keep git worktrees under .claude/worktrees/ inside the
    // repo (see CLAUDE.md). Without this, vitest discovers and runs each
    // worktree's copy of the suite, so one session's WIP can fail another's run.
    // accounts/ (the IdP) runs on Bun and uses `bun:test`, which vitest can't
    // load — it has its own `bun test` runner (see accounts/package.json).
    exclude: [...defaultExclude, "**/.claude/**", "**/accounts/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      reporter: ["text", "html"],
    },
  },
});
