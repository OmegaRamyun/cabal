# tests/

Run everything with `npm test` (which runs `node --test "tests/**/*.test.mjs"`; the bare `node --test tests/` form fails on Node 24, which treats `tests/` as a file path).

Each task owns its own test file, `tests/txx.test.mjs` (for example
`tests/t02.test.mjs`), covering that task's pure functions with fixtures.
The T10 harness task owns only the harness (`package.json`, this README,
and the CI workflow), not any other task's tests. A task whose test file is
missing is a gap to report, not something the harness fills in.

No test framework, no coverage gate. Tests use the built-in `node:test` and
`node:assert` modules only.
