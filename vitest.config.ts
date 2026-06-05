import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Parallel sessions keep git worktrees under .claude/worktrees/ inside the
    // repo (see CLAUDE.md). Without this, vitest discovers and runs each
    // worktree's copy of the suite, so one session's WIP can fail another's run.
    exclude: [...defaultExclude, "**/.claude/**"],
  },
});
