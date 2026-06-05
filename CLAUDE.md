# CLAUDE.md

How to write code in this repo. **What** we're building lives in `SPEC.md` — read it for architecture and decisions; don't duplicate it here.

## Worktrees (parallel sessions — do this first)
- Multiple Claude sessions run against this repo at once. **Never edit the primary checkout directly** — sessions would collide.
- At the start of any session that will change files, **create and enter a dedicated git worktree** (`EnterWorktree`) before the first edit, and do all work there. One worktree per session, on its own branch.
- Commit on the worktree branch; merge to `main` when the work is verified. Read-only inspection needs no worktree.

## Commands
- Install: `bun install`
- Dev: `bun run dev`
- Build: `bun run build` — must pass before any work is "done"
- Lint + format + autofix: `bun run check` — Biome owns this; never hand-format

## Comments & verbosity (the main rule)
- Default to **no comment**. Code should read on its own.
- Comment only the *why* of something non-obvious (a constraint, a gotcha, a tradeoff). Never narrate *what* the next line does.
- Delete: section banners, decorative dividers, restating the function/var name in prose, step-by-step play-by-play, and "TODO"-style filler.
- If a comment explains *what*, the fix is usually a clearer name or a small function — not the comment.
- One short sentence beats a paragraph. Prose in chat replies should be tight too.

## Code style
- Biome owns formatting and import order — don't reformat by hand or fight it.
- Match the surrounding code; don't introduce a second pattern for a job already solved here.
- Prefer small named functions over inline explanation.
- TypeScript: explicit narrow types at module boundaries; infer locally.
- Prefer `bun`/platform/stdlib over adding a dependency; justify any new dep.

## Architecture invariants (don't break — see `SPEC.md`)
- Content renders at runtime from the CDN; never add a step that rebuilds the site when content changes.
- Never write a raw IP or email into the repo; anonymous identity is a derived `ip_hash` only.
- Editing stays in-site: no "edit on GitHub" link-out, no asking the user for a token.
- One Worker is the only backend; don't add a database or a second service.

## Workflow
- Before declaring done: `bun run check` and `bun run build`, both clean.
- Update `SPEC.md` when a decision or milestone status changes.
