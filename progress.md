# Progress

Append 2–5 lines at the end of every session: date, features.json id, what changed, what's next or blocked.

- 2026-10-06 · setup · Repo created from the Project docs; guardrails installed by hand. Next: M0-01-scaffold (Kayden pins POCKETBASE_VERSION first).
- 2026-10-08 · M0-01-scaffold · Scaffold in: scripts/fetch-pb.sh, package.json (Node 24, exact pins), the Vite + React + TS app in web/, web/src/lib/pb.ts and serverClock.ts, build.json and the footer sha, and test/harness/ (one throwaway PocketBase per test file, fixture users, impersonation). `npm run check` green twice (13 tests).
  Confirmed on v0.40.4: health is `GET /api/health` (200, JSON body with `"code":200`); `--indexFallback` is on by default, and with an index.html present every unknown path answers 200 text/html, unknown `/api/` paths and missing assets included, so smoke tests must check the body. Migrations still apply on serve with `--automigrate=false` (the harness uses it so nothing is written into pb_migrations/).
  The harness creates its superuser with `pocketbase superuser upsert` in the temp data dir only (Kayden's call, 2026-10-08). The sandbox masks pb_public/ (from the `Edit(/pb_public/**)` deny), so `npm run build` and `npm run check` only pass outside the sandbox; npm also needs `npm_config_cache` under $TMPDIR there.
  For Kayden: copy docs/drafts/ops-md-m0-01.md into ops.md §5 and strike decisions.md Open items #2. Next: M0-02-schema (plan mode: migrations).
