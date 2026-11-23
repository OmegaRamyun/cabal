# Task queue — Cabal Ring Kit Stage 1 MVP

Parallel-agent queue. One task = one file set + one acceptance test.
Agents: claim by branching `task/Txx-short-name`, flip status to
`claimed` in your branch, push when `npm test` is green. Coordinator
merges. Never edit another task's files.

| Task | Scope | Files owned | Status | Branch | Lane |
|---|---|---|---|---|---|
| T01 | App shell, layout, module registry | `index.html`, `style.css`, `app.js` | open | — | Sonnet |
| T02 | Intent composers (X / Bluesky / Threads / Reddit) | `src/intents.mjs`, `tests/t02.test.mjs` | open | — | Sonnet |
| T03 | Similarity gate — lexical | `src/similarity.mjs`, `tests/t03.test.mjs` | open | — | Sonnet |
| T04 | Similarity gate — MiniLM embeddings (opt-in) | `src/embeddings.mjs`, `tests/t04.test.mjs` | open | — | Hydrogen |
| T05 | Matchmaking directory + match score | `directory/`, `schemas/directory.schema.json`, `src/match.mjs`, `tests/t05.test.mjs` | open | — | Sonnet |
| T06 | Discord #rings bridge | `src/discord.mjs`, `tests/t06.test.mjs` | open | — | Hydrogen |
| T07 | Kickstarter planner + referral tags | `src/kickstarter.mjs`, `tests/t07.test.mjs` | open | — | Sonnet |
| T08 | Steam UTM builder + campaign templates | `src/steam.mjs`, `src/templates.mjs`, `tests/t08.test.mjs` | open | — | Hydrogen |
| T09 | Pre-post checklist + docs | `src/checklist.mjs`, `CONTRIBUTING.md`, `tests/t09.test.mjs` | open | — | Hydrogen |
| T10 | Test harness + CI | `package.json`, `tests/`, `.github/workflows/test.yml` | open | — | Sonnet |

Lane suggestions are a starting split, not a lock — the coordinator
assigns by quota and load. T10 goes last or alongside; it owns the
harness, other tasks own their test files.
