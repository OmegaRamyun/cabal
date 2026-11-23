# Contributing to Cabal Ring Kit

Thanks for helping build Cabal Ring Kit. Read [`AGENTS.md`](AGENTS.md) before writing code.

## Picking a Task

1. Check [`tasks/INDEX.md`](tasks/INDEX.md) for tasks marked `open`.
2. Read [`AGENTS.md`](AGENTS.md) and the task spec in `tasks/Txx-*.md`.
3. Respect file ownership: **one task = one file set**. Only edit the files listed under your task. Never edit another task's files, and never edit `tasks/INDEX.md` (only the coordinator updates the index). If your work requires a shared change, stop and note it in your report.

## Branch Naming

Use one branch per task, branched from `main`:

```
task/Txx-short-name
```

For example: `task/T09-checklist-docs`.

## Claim Protocol

1. Branch from `main` using `task/Txx-short-name`.
2. In your branch, update the task file (`tasks/Txx-*.md`) to set `Status: claimed`.
3. Implement the task, write the acceptance test, and run `npm test` until all tests pass.
4. Push your branch to the remote without merging (the coordinator merges green branches).
5. Report back with:
   - Branch name
   - Files changed
   - Test result
   - Any needed shared changes (if applicable)

## Acceptance Rule

Every task must ship `tests/<task>.test.mjs` (run via `node --test` / `npm test`) covering its pure functions with fixtures, and it must be green before you are done. Do not add skipped tests for DOM-only behaviour — document a manual check note in the task file instead.

## Project Constraints

- **Stack:** Vanilla ES modules (`src/<name>.mjs` exporting pure functions and a `mount(rootEl)`), no framework, no bundler, no build step, and no runtime npm dependencies.
- **Licensing:** No Postiz code and no AGPL-licensed code, ever. Mirror adapter patterns only and re-implement from scratch.
- **Human-written copy only:** No AI-generated campaign copy presented as human. Templates provide structure and disclosure lines, never fill-in-the-blank captions. Every ring share must be human-written, in the sharer's own words, staggered, and disclosed.
- **No automation or engagement gaming:** No auto-posting, auto-like, auto-follow, auto-comment, auto-DM, vote exchange, scraping, browser automation, or password logins. Posting happens only when a human taps Post in the platform's own composer.
- **Credentials & data:** No credentials or tokens committed or stored anywhere. Webhook URLs and user state live in browser `localStorage` only.
- **Accuracy & terminology:** No unverified numbers presented as fact (see `AGENTS.md` for the do-not-cite list). Do not use SCT codes in code or docs; use DISARM vocabulary and plain, testable rules.

## Code of Conduct

Be a decent human: treat contributors and players with respect, assume good faith, and keep discussions constructive. Astroturfing contributions and any quota, ledger, points, streak, or engagement-reward features are strictly off-limits — those PRs are refused on sight.
